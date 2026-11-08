import { api, key } from "./api.js";
import { MAIN_STAGES, TECH_STAGES, stages, techAction, dispositions, roles, services2, where } from "./labels.js";
import {
  t, tr, esc, icon, link, button, head, empty, dateText, dateLine, badge, sar, who, field, inp, area, select,
  submit, formData, dialog, closeDialog, toast,
} from "./ui.js";

const ref = (m) => (m.move_no ? "#" + Number(m.move_no) : "#" + String(m.id).slice(0, 6));
const route = (m) =>
  '<div class="pathline">' + icon("route") + esc(m.pickup_address || t("عنوان الاستلام", "Pickup")) + " " +
  icon("arrow", 15) + " " + esc(m.dropoff_address || t("عنوان التسليم", "Delivery")) + "</div>";

/** a move in a list (customer or company) */
export function moveCard(m) {
  const me = who();
  const url = m.status === "draft" ? "new/" + m.id : "request/" + m.id;
  const sub = me.role === "company_admin"
    ? esc(m.customer_name) + (m.price_halalas != null ? " · " + sar(m.price_halalas) : "") +
      (m.assigned_agent_name ? " · " + icon("user", 14) + esc(m.assigned_agent_name) : "")
    : m.company_name ? esc(m.company_name) : m.item_count ? m.item_count + " " + t("قطعة", "items") : t("مسودة", "Draft");
  return (
    '<article class="request-card"><div class="row"><span class="ref"><bdi>' + ref(m) + "</bdi></span>" + badge(m) +
    "</div><h3>" + sub + "</h3>" + route(m) +
    '<div class="cardfoot"><span>' + icon("calendar", 15) + (m.date_from ? dateText(m.date_from) : "—") + "</span>" +
    link(url, (m.status === "draft" ? t("أكمل الطلب", "Continue") : t("تفاصيل الطلب", "View details")) + icon("arrow", 15), "textlink") +
    "</div></article>"
  );
}

/** a technician task in a list */
export function taskCard(x) {
  return (
    '<article class="request-card"><div class="row"><span class="ref"><bdi>#' + x.move_no + "</bdi></span>" + badge(x) +
    "</div><h3>" + esc(x.customer_name) + "</h3>" + route(x) +
    (x.progress ? progressbar(x.progress.percent) : "") +
    '<div class="cardfoot"><span>' + icon("calendar", 15) + dateLine(x) + "</span>" +
    link("task/" + x.id, t("فتح المهمة", "Open task") + icon("arrow", 15), "textlink") + "</div></article>"
  );
}

const progressbar = (pct) =>
  '<div class="nq-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>';

/** their .tracker list, over our fixed stage line */
function tracker(m, events) {
  const stage = m.current_stage;
  if (stage === "cancelled" || stage === "rejected")
    return '<div class="notice">' + icon("flag") + tr(stages[stage]) + "</div>";
  const index = MAIN_STAGES.indexOf(stage);
  const skipped = new Set(events.filter((e) => e.skipped).map((e) => e.stage));
  return (
    '<ol class="tracker">' +
    MAIN_STAGES.map((s, i) =>
      '<li class="' + (i === index ? "current" : i < index ? "done" : "") + '"><i>' + (i < index ? icon("check", 12) : "") +
      "</i><span>" + tr(stages[s]) + (skipped.has(s) ? ' <small class="hint">(' + t("تم تخطيها", "skipped") + ")</small>" : "") +
      "</span></li>").join("") +
    "</ol>"
  );
}

function history(events) {
  return (
    '<ol class="history">' +
    events.slice().reverse().filter((e) => !e.skipped).map((e) =>
      "<li><i></i><div><b>" + tr(stages[e.stage]) + "</b><small>" +
      new Date(e.created_at).toLocaleString(t("ar-SA-u-ca-gregory", "en-GB"), { dateStyle: "medium", timeStyle: "short" }) +
      " · " + tr(roles[e.actor_type]) + "</small>" +
      (e.photo_url ? '<p><a class="textlink" href="' + esc(e.photo_url) + '" target="_blank">' + icon("camera", 15) + t("صورة", "Photo") + "</a></p>" : "") +
      "</div></li>").join("") +
    "</ol>"
  );
}

const line = (k, v) => '<div class="bill-line"><span>' + k + "</span><bdi>" + v + "</bdi></div>";
const place = (p) =>
  esc(p.address || "—") + '<br><small class="hint">' + t("الطابق ", "Floor ") + (p.floor ?? "—") + " · " +
  (p.has_elevator ? t("يوجد مصعد", "elevator") : t("بدون مصعد", "no elevator")) + "</small>";

function quotePanel(q) {
  if (!q) return "";
  return (
    '<div class="panel"><h2>' + t("عرض السعر المؤكد", "Confirmed price") + "</h2>" +
    line(t("الشاحنة", "Truck"), esc(q.truck_name) + " × " + q.trips) +
    line(t("عدد العمال", "Crew"), q.crew_size) +
    line(t("الحجم", "Volume"), Number(q.volume_m3).toFixed(1) + " m³") +
    line(t("المدة التقديرية", "Estimated time"), q.estimated_minutes + t(" دقيقة", " min")) +
    '<div class="bill-total"><b>' + t("الإجمالي", "Total") + "</b><strong>" + sar(q.price_halalas) + "</strong></div></div>"
  );
}

function itemsPanel(items, title = t("الأغراض", "Items")) {
  const keep = items.filter((i) => (i.disposition ?? "keep") === "keep");
  return (
    '<div class="panel"><h2>' + title + " (" + keep.length + ")</h2>" +
    (items.map((i) =>
      '<div class="bill-line"><span>' + esc(t(i.name_ar, i.name_en)) + (i.quantity > 1 ? " × " + i.quantity : "") +
      (i.fragile ? ' <span class="badge cancelled"><i></i>' + t("قابل للكسر", "fragile") + "</span>" : "") +
      "</span><bdi>" + tr(dispositions[i.disposition ?? "keep"]) + "</bdi></div>").join("") ||
      "<p>" + t("لا توجد أغراض.", "No items.") + "</p>") +
    "</div>"
  );
}

function chatPanel(moveId, messages) {
  const me = who();
  return (
    '<div class="panel"><h2>' + icon("help", 18) + " " +
    (me.role === "customer" ? t("المحادثة مع الفني", "Chat with your technician") : t("المحادثة مع العميل", "Chat with the client")) +
    '</h2><div class="nq-chat" id="chat">' +
    (messages.map((m) =>
      '<div class="nq-msg ' + (m.sender_id === me.id ? "me" : "") + '"><small>' + esc(m.sender_name) + " · " +
      tr(roles[m.sender_role]) + "</small>" + esc(m.body) + "</div>").join("") ||
      '<p class="hint">' + t("لا توجد رسائل بعد.", "No messages yet.") + "</p>") +
    '</div><form data-form="message" data-id="' + moveId + '" class="nq-send">' +
    inp("body", "", 'required maxlength="2000" autocomplete="off" placeholder="' + t("اكتب رسالة", "Write a message") + '"') +
    '<button class="btn primary" type="submit">' + t("إرسال", "Send") + "</button></form></div>"
  );
}

const stars = () =>
  select("stars", { 5: "★★★★★", 4: "★★★★", 3: "★★★", 2: "★★", 1: "★" }, "5");

function ratePanel(kind, id, title) {
  return (
    '<div class="panel"><h2>' + icon("star", 18) + " " + title + '</h2><form data-form="rate" data-kind="' + kind +
    '" data-id="' + id + '"><div class="formgrid">' + field(t("التقييم", "Rating"), stars()) +
    field(t("تعليق (اختياري)", "Comment (optional)"), inp("comment", "", 'maxlength="1000"'), true) + "</div>" +
    submit(t("إرسال التقييم", "Send rating")) + "</form></div>"
  );
}

const ratingLine = (r) => "★".repeat(r.stars) + "☆".repeat(5 - r.stars) + (r.comment ? " · " + esc(r.comment) : "");

// ---------- customer + company: /request/:id ----------

export async function requestDetail(id) {
  const me = who();
  const m = await api("GET", "/moves/" + id);
  if (m.status === "draft") {
    location.hash = "/new/" + id;
    return "";
  }
  const company = me.role === "company_admin";
  const [tracking, messages, ratings, agents] = await Promise.all([
    api("GET", "/moves/" + id + "/tracking"),
    api("GET", "/moves/" + id + "/messages").catch(() => []),
    m.current_stage === "completed" ? api("GET", "/moves/" + id + "/ratings").catch(() => []) : [],
    company ? api("GET", "/company/agents") : [],
  ]);
  const stage = m.current_stage;
  const open = !["completed", "rejected", "cancelled"].includes(stage);
  const beforeCrew = MAIN_STAGES.indexOf(stage) < MAIN_STAGES.indexOf("on_the_way");

  // what this role can do now
  let actions = "";
  if (company) {
    if (stage === "confirmed")
      actions += stageButton(id, "accepted", t("قبول الطلب", "Accept"), "btn primary") +
        stageButton(id, "rejected", t("رفض", "Reject"), "btn outline danger");
    if (open && beforeCrew) actions += button("cancel", t("إلغاء الطلب", "Cancel move"), "btn outline danger").replace("<button", '<button data-id="' + id + '"');
    actions += '<button type="button" class="btn outline" data-act="job-sheet" data-id="' + id + '">' + icon("file") + t("ورقة العمل", "Job sheet") + "</button>";
  } else if (open && beforeCrew) {
    actions += button("cancel", t("إلغاء الطلب", "Cancel move"), "btn outline danger").replace("<button", '<button data-id="' + id + '"');
  }

  const assign = company && ["accepted", "crew_assigned"].includes(stage)
    ? '<div class="panel"><h2>' + icon("crew", 18) + " " + t("الفني المسؤول", "Technician") + "</h2>" +
      (agents.length
        ? '<form data-form="assign" data-id="' + id + '" class="nq-send">' +
          '<select name="agent_id" required><option value="">' + t("اختر فنياً", "Choose a technician") + "</option>" +
          agents.map((a) => '<option value="' + a.id + '" ' + (a.id === m.assigned_agent_id ? "selected" : "") + ">" + esc(a.name) + "</option>").join("") +
          '</select><button class="btn primary" type="submit">' + (m.assigned_agent_id ? t("تغيير", "Change") : t("تعيين", "Assign")) + "</button></form>"
        : "<p>" + t("أضف فنياً أولاً من صفحة الفنيين.", "Add a technician first on the Technicians page.") + "</p>" + link("team", t("الفنيون", "Technicians"), "textlink")) +
      "</div>"
    : "";

  const myRating = ratings.find((r) => r.rater_role === (company ? "none" : "customer"));
  const rating = !company && stage === "completed" && m.technician
    ? myRating
      ? '<div class="panel"><h2>' + t("تقييمك", "Your rating") + "</h2><p>" + ratingLine(myRating) + "</p></div>"
      : ratePanel("service", id, t("قيّم الخدمة", "Rate the service"))
    : "";

  return (
    head("<bdi>" + ref(m) + "</bdi>", company ? esc(m.customer?.name ?? t("طلب نقل", "Moving request")) : esc(m.company?.name_en ?? t("طلب نقل", "Moving request")),
      esc(m.pickup_address) + " " + icon("arrow", 14) + " " + esc(m.dropoff_address), badge(m)) +
    '<div class="detail-layout"><div>' +
    '<div class="panel"><div class="row"><h2>' + t("الحالة الآن", "Current stage") + "</h2>" + icon("route") + "</div><p>" +
    tr(stages[where(m)]) + "</p>" + (m.progress ? progressbar(m.progress.percent) : "") +
    (actions ? '<div class="actionrow">' + actions + "</div>" : "") + "</div>" +
    assign + rating +
    (m.technician ? '<div class="panel"><h2>' + t("الفني", "Technician") + "</h2><p>" + icon("user", 16) + " " + esc(m.technician.name) + "</p></div>" : "") +
    (m.technician || company ? chatPanel(id, messages) : "") +
    '<div class="panel"><h2>' + t("تفاصيل النقل", "Moving details") + "</h2>" +
    line(t("الاستلام", "Pickup"), place({ address: m.pickup_address, floor: m.pickup_floor, has_elevator: m.pickup_has_elevator })) +
    line(t("التسليم", "Delivery"), place({ address: m.dropoff_address, floor: m.dropoff_floor, has_elevator: m.dropoff_has_elevator })) +
    line(t("الموعد", "Date"), dateLine(m)) +
    (m.notes ? line(t("ملاحظات", "Notes"), esc(m.notes)) : "") + "</div>" +
    quotePanel(m.quote) + itemsPanel(m.items) +
    (company && ratings.length ? '<div class="panel"><h2>' + t("التقييمات", "Ratings") + "</h2>" +
      ratings.map((r) => line(tr(roles[r.rater_role]), ratingLine(r))).join("") + "</div>" : "") +
    '<div class="panel"><h2>' + t("سجل النشاط", "Activity") + "</h2>" + history(tracking.events) + "</div>" +
    '</div><aside class="panel timeline"><h2>' + t("تتبّع النقل", "Track the move") + "</h2>" + tracker(m, tracking.events) + "</aside></div>"
  );
}

const stageButton = (id, stage, label, style) =>
  '<button type="button" class="' + style + '" data-act="stage" data-id="' + id + '" data-stage="' + stage + '">' + label + "</button>";

// ---------- technician: /task/:id ----------

export async function taskDetail(id) {
  const [x, messages] = await Promise.all([
    api("GET", "/tech/tasks/" + id),
    api("GET", "/moves/" + id + "/messages").catch(() => []),
  ]);
  const nav = (p, label) => p.navigation_url
    ? '<a class="btn outline" href="' + esc(p.navigation_url) + '" target="_blank" rel="noopener">' + icon("pin") + label + "</a>" : "";
  const done = x.current_stage === "completed";
  const statusList =
    '<div class="panel"><h2>' + t("تحديث الحالة", "Update status") + "</h2>" +
    '<ol class="tracker">' + x.statuses.map((s) =>
      '<li class="' + (s.done ? "done" : s.stage === x.recommended_next ? "current" : "") + '"><i>' + (s.done ? icon("check", 12) : "") +
      "</i><span>" + tr(stages[s.stage]) + "</span>" +
      (x.next_stages.includes(s.stage)
        ? '<button type="button" class="' + (s.stage === x.recommended_next ? "btn primary" : "btn outline") + ' nq-stagebtn" data-act="tech-stage" data-id="' + id +
          '" data-stage="' + s.stage + '">' + (s.stage === x.recommended_next ? tr(techAction[s.stage]) : t("تخطي إلى هنا", "Skip to")) + "</button>"
        : "") + "</li>").join("") + "</ol>" +
    (x.next_stages.length
      ? field(t("صورة مع التحديث (اختياري)", "Photo with the update (optional)"), '<input type="file" id="stagePhoto" accept="image/*" capture="environment">', true)
      : "") +
    "</div>";

  const finished = done
    ? '<section class="panel success"><span class="success-icon">' + icon("check", 35) + "</span><h2>" +
      t("تم إكمال النقل بنجاح!", "The move has been completed successfully!") + "</h2>" +
      (x.duration_minutes != null ? "<p>" + x.duration_minutes + t(" دقيقة في المهمة", " min on the job") + "</p>" : "") + "</section>" +
      (x.client_rating
        ? '<div class="panel"><h2>' + t("تقييمك للعميل", "Your rating of the client") + "</h2><p>" + ratingLine(x.client_rating) + "</p></div>"
        : ratePanel("client", id, t("قيّم العميل وأغلق المهمة", "Rate the client and close the task")))
    : "";

  return (
    head("<bdi>#" + x.move_no + "</bdi>", esc(x.customer.name), route(x.pickup.address ? { pickup_address: x.pickup.address, dropoff_address: x.dropoff.address } : {}), badge(x)) +
    (x.progress ? progressbar(x.progress.percent) : "") +
    finished +
    '<div class="detail-layout"><div>' +
    (done ? "" : statusList) +
    '<div class="panel"><h2>' + t("معلومات النقل", "Move information") + "</h2>" +
    line(t("العميل", "Client"), esc(x.customer.name)) +
    line(t("الاستلام", "Pickup"), place(x.pickup)) +
    line(t("التسليم", "Delivery"), place(x.dropoff)) +
    line(t("الخدمات", "Services"), x.services.map((s) => tr(services2[s])).join("، ")) +
    line(t("الموعد", "Scheduled"), dateLine(x.schedule)) +
    (x.quote ? line(t("الشاحنة", "Truck"), esc(x.quote.truck_name) + " × " + x.quote.trips + " · " + t("عمال ", "crew ") + x.quote.crew_size) : "") +
    (x.notes ? line(t("ملاحظات", "Notes"), esc(x.notes)) : "") +
    '<div class="actionrow">' + nav(x.pickup, t("الذهاب للاستلام", "Navigate to pickup")) + nav(x.dropoff, t("الذهاب للتسليم", "Navigate to delivery")) + "</div></div>" +
    chatPanel(id, messages) +
    '<div class="panel"><h2>' + t("ترتيب التحميل", "Load order") + " · " + x.job_sheet.totals.items + t(" قطعة، ", " items, ") +
    x.job_sheet.totals.volume_m3 + " m³</h2>" +
    x.job_sheet.load_order.map((i) =>
      '<div class="bill-line"><span>' + i.step + ". " + esc(t(i.name_ar, i.name_en)) + (i.quantity > 1 ? " × " + i.quantity : "") + "</span><bdi>" +
      [i.dismantle ? t("فك", "dismantle") : "", i.heavy ? t("ثقيل", "heavy") : "", i.fragile ? t("قابل للكسر", "fragile") : ""].filter(Boolean).join(" · ") +
      "</bdi></div>").join("") + "</div>" +
    '<div class="panel"><h2>' + t("سجل النشاط", "Activity") + "</h2>" + history(x.events) + "</div>" +
    "</div></div>"
  );
}

// ---------- lists ----------

const tabs = (base, current, list) =>
  '<div class="tabs" role="tablist">' + list.map(([k, label]) =>
    '<a role="tab" class="btn ' + (k === current ? "primary" : "outline") + '" href="#/' + base + (k ? "?" + (base === "bookings" ? "filter" : "scope") + "=" + k : "") + '">' + label + "</a>").join("") + "</div>";

export async function customerList(params) {
  const filter = params.get("filter") || "";
  const all = await api("GET", "/moves");
  const pick = {
    draft: (m) => m.status === "draft",
    active: (m) => m.status === "confirmed" && !["completed", "rejected", "cancelled"].includes(m.current_stage),
    completed: (m) => m.current_stage === "completed",
  }[filter] || (() => true);
  const moves = all.filter(pick);
  return (
    head(t("طلباتك", "Your moves"), t("طلباتي", "My moves"), "", link("new", t("طلب جديد", "New move"), "btn primary", "plus")) +
    tabs("bookings", filter, [["", t("الكل", "All")], ["draft", t("مسودات", "Drafts")], ["active", t("نشطة", "Active")], ["completed", t("مكتملة", "Completed")]]) +
    '<div class="cards">' + (moves.map(moveCard).join("") || empty(t("لا توجد طلبات هنا", "No moves here"))) + "</div>"
  );
}

export async function companyList(params) {
  const scope = params.get("scope") || "all";
  const all = await api("GET", "/company/moves?scope=" + (scope === "assign" ? "active" : scope));
  const moves = scope === "assign" ? all.filter((m) => m.current_stage === "accepted") : all;
  return (
    head(t("الشركة", "Company"), t("طلبات النقل", "Moving requests")) +
    tabs("requests", scope, [["all", t("الكل", "All")], ["incoming", t("واردة", "Incoming")], ["assign", t("بحاجة لفني", "Need technician")],
      ["active", t("جارية", "Active")], ["closed", t("منتهية", "Closed")]]) +
    '<div class="cards">' + (moves.map(moveCard).join("") || empty(t("لا توجد طلبات هنا", "No moves here"))) + "</div>"
  );
}

export async function techList(params) {
  const scope = params.get("scope") || "all";
  const tasks = await api("GET", "/tech/tasks?scope=" + scope);
  return (
    head(t("مهامي", "My tasks"), t("المهام", "Tasks")) +
    tabs("jobs", scope, [["all", t("الكل", "All")], ["assigned", t("مسندة", "Assigned")], ["in_progress", t("قيد التنفيذ", "In progress")], ["completed", t("مكتملة", "Completed")]]) +
    '<div class="cards">' + (tasks.map(taskCard).join("") || empty(t("لا توجد مهام هنا", "No tasks here"))) + "</div>"
  );
}

export async function teamPage() {
  const agents = await api("GET", "/company/agents");
  return (
    head(t("الشركة", "Company"), t("الفنيون", "Technicians"), "", button("agent-add", t("إضافة فني", "Add technician"), "btn primary", "plus")) +
    '<div class="panel">' +
    (agents.map((a) => '<div class="bill-line"><span>' + icon("user", 16) + " " + esc(a.name) + "</span><bdi>" + esc(a.email) + "</bdi></div>").join("") ||
      empty(t("لا يوجد فنيون بعد", "No technicians yet"))) +
    "</div>"
  );
}

// ---------- actions ----------

export function agentDialog() {
  dialog(t("إضافة فني", "Add a technician"),
    '<form data-form="agent"><div class="formgrid">' +
    field(t("الاسم", "Name"), inp("name", "", 'required maxlength="100"')) +
    field(t("البريد الإلكتروني", "Email"), inp("email", "", 'type="email" required dir="ltr"')) +
    field(t("كلمة المرور المؤقتة", "Temporary password"), inp("password", "", 'type="password" required minlength="8" dir="ltr" autocomplete="new-password"'), true) +
    "</div>" + submit(t("إضافة", "Add")) + "</form>");
}

export function cancelDialog(id) {
  dialog(t("إلغاء الطلب؟", "Cancel this move?"),
    "<p>" + t("لا يمكن التراجع عن الإلغاء.", "This can't be undone.") + '</p><div class="actionrow">' +
    button("dismiss", t("رجوع", "Back"), "btn outline") +
    '<button type="button" class="btn primary danger" data-act="cancel-confirm" data-id="' + id + '">' + t("نعم، ألغِ الطلب", "Yes, cancel") + "</button></div>");
}

export async function jobSheetDialog(id) {
  const s = await api("GET", "/moves/" + id + "/job-sheet");
  dialog(t("ورقة العمل", "Job sheet"),
    line(t("القطع", "Items"), s.totals.items) + line(t("الحجم", "Volume"), s.totals.volume_m3 + " m³") +
    line(t("الوزن", "Weight"), s.totals.weight_kg + " kg") + line(t("وقت الفك", "Dismantling"), s.totals.dismantle_minutes + t(" دقيقة", " min")) +
    "<h3>" + t("ترتيب التحميل", "Load order") + "</h3>" +
    s.load_order.map((i) => '<div class="bill-line"><span>' + i.step + ". " + esc(t(i.name_ar, i.name_en)) + (i.quantity > 1 ? " × " + i.quantity : "") +
      "</span><bdi>" + [i.dismantle ? t("فك", "dismantle") : "", i.heavy ? t("ثقيل", "heavy") : "", i.fragile ? t("قابل للكسر", "fragile") : ""].filter(Boolean).join(" · ") +
      "</bdi></div>").join(""));
}

export async function setStage(id, stage) {
  await api("POST", "/moves/" + id + "/events", { stage, idempotency_key: key() });
  toast(tr(stages[stage]));
}

export async function setTechStage(el) {
  el.disabled = true;
  const file = document.getElementById("stagePhoto")?.files?.[0];
  let body = { stage: el.dataset.stage, idempotency_key: key() };
  if (file) {
    const f = new FormData();
    f.set("stage", body.stage);
    f.set("idempotency_key", body.idempotency_key);
    f.set("photo", file);
    body = f;
  }
  try {
    await api("POST", "/tech/tasks/" + el.dataset.id + "/status", body);
    toast(tr(stages[el.dataset.stage]));
  } finally {
    el.disabled = false;
  }
}

export async function submitForm(kind, f) {
  const d = formData(f), id = f.dataset.id;
  if (kind === "message") {
    await api("POST", "/moves/" + id + "/messages", { body: d.body });
    f.reset();
  } else if (kind === "assign") {
    await api("POST", "/company/moves/" + id + "/assign", { agent_id: d.agent_id });
    toast(t("تم تعيين الفني", "Technician assigned"));
  } else if (kind === "rate") {
    const body = { stars: Number(d.stars), comment: d.comment || undefined };
    await api("POST", f.dataset.kind === "client" ? "/tech/tasks/" + id + "/rate-client" : "/moves/" + id + "/rating", body);
    toast(t("شكراً لتقييمك", "Thanks for rating"));
  } else if (kind === "agent") {
    await api("POST", "/company/agents", d);
    closeDialog();
    toast(t("تمت إضافة الفني", "Technician added"));
  }
}
