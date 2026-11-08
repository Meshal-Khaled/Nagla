import { api } from "./api.js";
import { dispositions, rooms } from "./labels.js";
import {
  t, tr, esc, icon, go, link, button, head, field, inp, area, check, submit, formData, toast, sar, dialog, closeDialog,
  checkPhoto, empty, errorText, timeText, today,
} from "./ui.js";

const names = [
  ["الصور", "Photos"],
  ["المسح الذكي", "AI scan"],
  ["الأغراض", "Items"],
  ["التفاصيل", "Details"],
  ["الأسعار", "Prices"],
];
const titles = [
  ["صوّر غرفك", "Photograph your rooms"],
  ["تعرّف على أغراضك", "Recognise your belongings"],
  ["راجع قائمة الأغراض", "Review your items"],
  ["العناوين والموعد", "Addresses and date"],
  ["قارن واختر شركة", "Compare and choose a company"],
];
const roomName = (k) => {
  const r = rooms.find((x) => x[0] === k);
  return r ? t(r[1], r[2]) : esc(k.replace(/_/g, " "));
};

/** #/new → creates a draft and opens it; #/new/<id>?step=N */
export async function bookingPage(id, params) {
  if (!id) {
    const m = await api("POST", "/moves");
    location.replace("#/new/" + m.id);
    return "";
  }
  const m = await api("GET", "/moves/" + id);
  if (m.status !== "draft") {
    location.replace("#/request/" + id);
    return "";
  }
  // furthest step this draft can open
  // (items can also be added by hand, so the item list opens once there are photos)
  const max = !m.photos.length ? 0 : !m.items.length ? 2 : !m.pickup_address || !m.dropoff_address || !m.date_from ? 3 : 4;
  let step = Number(params.get("step"));
  if (!params.has("step") || !Number.isInteger(step) || step < 0 || step > 4) step = !m.photos.length ? 0 : !m.items.length ? 1 : 2;
  step = Math.min(step, max);
  const body = [photosStep, detectStep, itemsStep, detailsStep, offersStep][step];
  return (
    head(t("طلب نقل جديد", "New moving request"), tr(titles[step]), t("الخطوة ", "Step ") + (step + 1) + " / 5") +
    '<div class="stepper">' +
    names.map((n, i) =>
      '<button type="button" data-act="step" data-id="' + id + '" data-i="' + i + '" class="' +
      (i === step ? "current" : i < step ? "done" : "") + '" ' + (i > max ? "disabled" : "") + "><b>" +
      (i < step ? icon("check", 14) : i + 1) + "</b><span>" + tr(n) + "</span></button>").join("") +
    "</div>" + (await body(m, max)) +
    '<p class="hint">' + link("bookings", t("حفظ والعودة لاحقاً", "Save and come back later"), "textlink") + "</p>"
  );
}

const footer = (id, step, nextLabel, enabled = true) =>
  '<div class="formfooter">' +
  (step ? '<button type="button" class="btn outline" data-act="step" data-id="' + id + '" data-i="' + (step - 1) + '">' + t("السابق", "Back") + "</button>" : "<span></span>") +
  '<button type="button" class="btn primary" data-act="step" data-id="' + id + '" data-i="' + (step + 1) + '" ' + (enabled ? "" : "disabled") + ">" +
  nextLabel + icon("arrow", 17) + "</button></div>";

// ---- 1. photos

async function photosStep(m) {
  const byRoom = {};
  for (const p of m.photos) (byRoom[p.room] ??= []).push(p);
  return (
    '<form class="panel booking-form" data-form="photos" data-id="' + m.id + '">' +
    '<p class="hint">' + t("صوّر كل غرفة من أكثر من زاوية. نحذف بيانات الموقع من الصور تلقائياً.",
      "Take a few photos of each room. We remove location data from photos automatically.") + "</p>" +
    '<div class="formgrid">' +
    field(t("الغرفة", "Room"),
      '<select name="room" required>' + rooms.map(([k, ar, en]) => '<option value="' + k + '">' + t(ar, en) + "</option>").join("") + "</select>") +
    field(t("الصور", "Photos"), '<input type="file" name="file" accept="image/jpeg,image/png,image/webp" multiple required>') +
    "</div>" + submit(t("رفع الصور", "Upload photos")) + "</form>" +
    (Object.keys(byRoom).length
      ? Object.entries(byRoom).map(([room, ps]) =>
        '<div class="panel"><h2>' + roomName(room) + " · " + ps.length + '</h2><div class="nq-photos">' +
        ps.map((p) => '<figure><img src="' + esc(p.url) + '" alt="' + roomName(room) + '" loading="lazy">' +
          '<button type="button" class="iconbtn" data-act="photo-delete" data-id="' + p.id + '" aria-label="' + t("حذف", "Delete") + '">' + icon("x", 16) + "</button></figure>").join("") +
        "</div></div>").join("")
      : empty(t("لا توجد صور بعد", "No photos yet"), t("ابدأ بغرفة المعيشة.", "Start with the living room."))) +
    footer(m.id, 0, t("التالي", "Continue"), m.photos.length > 0)
  );
}

export async function uploadPhotos(f) {
  const files = [...f.querySelector('input[type="file"]').files];
  if (!files.length) throw Error("required");
  files.forEach(checkPhoto);
  const body = new FormData();
  body.set("room", new FormData(f).get("room"));
  for (const file of files) body.append("file", file, file.name);
  await api("POST", "/moves/" + f.dataset.id + "/photos", body);
  toast(t("تم رفع الصور", "Photos uploaded"));
}

// ---- 2. AI scan

async function detectStep(m) {
  const rooms = new Set(m.photos.map((p) => p.room)).size;
  return (
    '<div class="panel"><div class="row"><h2>' + icon("camera", 20) + " " + t("المسح بالذكاء الاصطناعي", "AI scan") + "</h2></div><p>" +
    m.photos.length + t(" صورة في ", " photos in ") + rooms + t(" غرفة. نتعرف على الأثاث والأجهزة والكراتين في كل غرفة.",
      " rooms. We recognise furniture, appliances and boxes in each room.") + "</p>" +
    '<p id="scanStatus" class="hint" role="status">' +
    (m.items.length ? t("تم المسح. يمكنك إعادة المسح أو المتابعة.", "Scanned. You can scan again or continue.") : "") + "</p>" +
    '<div class="actionrow"><button type="button" class="btn primary" data-act="detect" data-id="' + m.id + '">' + icon("camera") +
    (m.items.length ? t("إعادة المسح", "Scan again") : t("ابدأ المسح", "Start scan")) + "</button></div></div>" +
    footer(m.id, 1, t("التالي", "Continue"), m.items.length > 0)
  );
}

let scanning = false;
export async function runDetection(id) {
  if (scanning) return;
  scanning = true;
  const status = (msg) => { const el = document.getElementById("scanStatus"); if (el) el.textContent = msg; };
  try {
    const { job_id } = await api("POST", "/moves/" + id + "/plan");
    status(t("جارٍ المسح… قد يستغرق دقيقة.", "Scanning… this can take a minute."));
    const started = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      const job = await api("GET", "/jobs/" + job_id);
      if (job.status === "done") break;
      if (job.status === "failed") throw Object.assign(Error(job.error || "failed"), { code: "scan_failed" });
      status(t("جارٍ المسح… ", "Scanning… ") + Math.round((Date.now() - started) / 1000) + t(" ث", "s"));
      if (Date.now() - started > 10 * 60 * 1000) throw Error("timeout");
    }
    toast(t("اكتمل المسح", "Scan complete"));
    go("new/" + id + "?step=2");
  } catch (err) {
    status(t("تعذر المسح: ", "Scan failed: ") + errorText(err));
    throw err;
  } finally {
    scanning = false;
  }
}

// ---- 3. items

async function itemsStep(m) {
  const disp = (i) =>
    '<select data-item="' + i.id + '" data-field="disposition" aria-label="' + t("القرار", "Decision") + '">' +
    Object.entries(dispositions).map(([k, v]) => '<option value="' + k + '" ' + (k === i.disposition ? "selected" : "") + ">" + tr(v) + "</option>").join("") +
    "</select>";
  return (
    '<div class="panel"><div class="row"><h2>' + m.items.length + t(" قطعة", " items") + "</h2>" +
    button("catalog", t("إضافة قطعة", "Add an item"), "btn outline", "plus").replace("<button", '<button data-id="' + m.id + '"') + "</div>" +
    '<p class="hint">' + t("عدّل الكمية أو القرار، واحذف ما ليس صحيحاً. القطع المحددة \"نقل\" فقط تدخل في السعر.",
      "Change quantities or decisions and delete anything wrong. Only items marked \"Move\" count towards the price.") + "</p>" +
    m.items.map((i) =>
      '<div class="nq-item"><div><strong>' + esc(t(i.name_ar, i.name_en)) + "</strong><small>" +
      (i.source === "ai" ? icon("camera", 13) + t("اكتشاف ذكي", "AI") : t("مضاف يدوياً", "Added")) + " · " + Number(i.volume_m3).toFixed(2) + " m³" +
      (i.fragile ? " · " + t("قابل للكسر", "fragile") : "") + "</small></div>" +
      '<input type="number" min="1" max="500" value="' + i.quantity + '" data-item="' + i.id + '" data-field="quantity" aria-label="' + t("الكمية", "Quantity") + '">' +
      disp(i) +
      '<button type="button" class="iconbtn" data-act="item-delete" data-id="' + i.id + '" aria-label="' + t("حذف", "Delete") + '">' + icon("x", 16) + "</button></div>").join("") +
    "</div>" + footer(m.id, 2, t("التالي", "Continue"), m.items.length > 0)
  );
}

let saveTimer;
export function itemChanged(el) {
  clearTimeout(saveTimer);
  const value = el.dataset.field === "quantity" ? Number(el.value) : el.value;
  if (el.dataset.field === "quantity" && (!Number.isInteger(value) || value < 1 || value > 500)) return;
  saveTimer = setTimeout(() => {
    api("PATCH", "/items/" + el.dataset.item, { [el.dataset.field]: value })
      .then(() => toast(t("تم الحفظ", "Saved")))
      .catch((err) => toast(errorText(err)));
  }, 400);
}

export async function catalogDialog(moveId, q = "") {
  const rows = await api("GET", "/catalog" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const list = rows.filter((r) => r.category !== "other" || q).slice(0, 40);
  const html =
    '<form data-form="catalog-search" data-id="' + moveId + '" class="nq-send">' +
    inp("q", q, 'type="search" maxlength="100" placeholder="' + t("ابحث: كنبة، سرير، ثلاجة…", "Search: sofa, bed, fridge…") + '"') +
    '<button class="btn outline" type="submit">' + icon("search") + "</button></form>" +
    '<div class="nq-catalog">' +
    (list.map((r) =>
      '<button type="button" class="listrow" data-act="catalog-add" data-move="' + moveId + '" data-id="' + r.id + '"><div><strong>' +
      esc(t(r.name_ar, r.name_en)) + "</strong><small>" + esc(r.variant) + " · " + Number(r.volume_m3).toFixed(2) + " m³</small></div>" +
      icon("plus", 18) + "</button>").join("") || '<p class="hint">' + t("لا نتائج", "No results") + "</p>") +
    "</div>";
  dialog(t("إضافة قطعة من الكتالوج", "Add from the catalog"), html);
}

// ---- 4. details

async function detailsStep(m) {
  const loc = (k, label) =>
    "<h3>" + label + "</h3>" + '<div class="formgrid">' +
    field(t("العنوان", "Address"), inp(k + "_address", m[k + "_address"] || "", 'required maxlength="500" placeholder="' + t("الحي، المدينة", "District, city") + '"'), true) +
    field(t("الطابق", "Floor"), inp(k + "_floor", m[k + "_floor"] ?? 0, 'type="number" min="-5" max="200" required')) +
    check(k + "_has_elevator", t("يوجد مصعد", "Elevator"), !!m[k + "_has_elevator"]) + "</div>";
  return (
    '<form class="panel booking-form" data-form="details" data-id="' + m.id + '">' +
    loc("pickup", t("من (الاستلام)", "From (pickup)")) +
    loc("dropoff", t("إلى (التسليم)", "To (delivery)")) +
    "<h3>" + t("الموعد", "Date") + '</h3><div class="formgrid">' +
    field(t("من تاريخ", "From"), inp("date_from", m.date_from || "", 'type="date" required min="' + today() + '"')) +
    field(t("إلى تاريخ", "To"), inp("date_to", m.date_to || "", 'type="date" min="' + today() + '"')) +
    field(t("الوقت المفضل", "Preferred time"), inp("preferred_time", timeText(m.preferred_time), 'type="time"')) +
    field(t("ملاحظات للفريق", "Notes for the crew"), area("notes", m.notes || "", 'maxlength="2000" rows="3"'), true) +
    "</div>" +
    '<div class="formfooter"><button type="button" class="btn outline" data-act="step" data-id="' + m.id + '" data-i="2">' + t("السابق", "Back") + "</button>" +
    submit(t("عرض الأسعار", "See prices")) + "</div></form>"
  );
}

export async function saveDetails(f) {
  const d = formData(f);
  const num = (v) => (v === "" || v == null ? null : Number(v));
  await api("PATCH", "/moves/" + f.dataset.id, {
    pickup_address: d.pickup_address.trim(), pickup_floor: num(d.pickup_floor), pickup_has_elevator: !!d.pickup_has_elevator,
    dropoff_address: d.dropoff_address.trim(), dropoff_floor: num(d.dropoff_floor), dropoff_has_elevator: !!d.dropoff_has_elevator,
    date_from: d.date_from || null, date_to: d.date_to || d.date_from || null,
    preferred_time: d.preferred_time || null, notes: d.notes.trim() || null,
  });
  go("new/" + f.dataset.id + "?step=4");
}

// ---- 5. offers

async function offersStep(m) {
  const q = await api("GET", "/moves/" + m.id + "/quotes");
  return (
    '<div class="cards">' +
    (q.offers.map((o, i) =>
      '<article class="request-card nq-offer"><div class="row"><h3>' + esc(o.company_name) + "</h3>" +
      (i === 0 ? '<span class="badge completed"><i></i>' + t("الأقل سعراً", "Lowest price") + "</span>" : "") + "</div>" +
      '<p class="nq-price">' + sar(o.price_halalas) + "</p><p>" + icon("truck", 16) + " " + esc(o.truck_name) + " (" + o.truck_capacity_m3 + " m³) × " + o.trips +
      " · " + icon("crew", 16) + " " + o.crew_size + " · " + icon("clock", 16) + " ~" + o.estimated_minutes + t(" دقيقة", " min") + "</p>" +
      '<button type="button" class="btn primary wide" data-act="confirm" data-id="' + m.id + '" data-company="' + o.company_id + '" data-name="' + esc(o.company_name) + '">' +
      t("تأكيد مع ", "Confirm with ") + esc(o.company_name) + "</button></article>").join("") ||
      empty(t("لا توجد أسعار", "No prices"), t("حدد قطعة واحدة على الأقل للنقل.", "Mark at least one item as Move."))) +
    "</div>" +
    '<div class="formfooter"><button type="button" class="btn outline" data-act="step" data-id="' + m.id + '" data-i="3">' + t("السابق", "Back") + "</button><span></span></div>"
  );
}

export function confirmDialog(el) {
  dialog(t("تأكيد الطلب؟", "Confirm your move?"),
    "<p>" + t("سيُرسل طلبك إلى ", "Your move goes to ") + esc(el.dataset.name) +
    t(" ويُثبّت السعر. بعدها لا يمكن تعديل الأغراض.", " and the price is locked. Items can't be edited after this.") + "</p>" +
    '<div class="actionrow">' + button("dismiss", t("رجوع", "Back"), "btn outline") +
    '<button type="button" class="btn primary" data-act="confirm-go" data-id="' + el.dataset.id + '" data-company="' + el.dataset.company + '">' +
    t("تأكيد", "Confirm") + "</button></div>");
}

export async function confirmMove(el) {
  await api("POST", "/moves/" + el.dataset.id + "/confirm", { company_id: el.dataset.company });
  closeDialog();
  toast(t("تم تأكيد طلبك", "Your move is confirmed"));
  go("request/" + el.dataset.id);
}
