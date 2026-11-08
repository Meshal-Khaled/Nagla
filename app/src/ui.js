import { stages, bucket, services } from "./labels.js";
import { session } from "./api.js";
export const lang = () =>
  localStorage.getItem("naqla.lang") === "en" ? "en" : "ar";
export const t = (ar, en) => (lang() === "ar" ? ar : en);
export const tr = (p) => (p ? t(...p) : "—");
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const drawings = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  diagonal: "M5 19 19 5M7 5h12v12",
  menu: "M3 6h18M3 12h18M3 18h18",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  sun: "M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  home: "m2 11 10-8 10 8M5 10v11h5v-7h4v7h5V10",
  truck:
    "M2 5h12v12H2zM14 9h4l4 5v3h-8M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  box: "m3 7 9-5 9 5-9 5-9-5Zm0 0v10l9 5 9-5V7M12 12v10M7 4.7l10 5.5",
  sofa: "M4 12V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4M4 20v-2m16 2v-2M6 14v-2a2 2 0 0 0-4 0v6h20v-6a2 2 0 0 0-4 0v2Z",
  tools:
    "m5 3 3 2 1 3 10 10-2 2L7 10 4 9 2 6ZM14 9a5 5 0 0 1 6-6l-3 3 1 2 3-2a5 5 0 0 1-6 6M10 15l-6 6-2-2 6-6",
  pin: "M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  route:
    "M7 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 4h10a4 4 0 0 1 0 8H7a4 4 0 0 0 0 8h10M21 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  shield: "m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5Zm-4 9 3 3 5-6",
  check: "m4 12 5 5L20 6",
  plus: "M12 4v16M4 12h16",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  bell: "M4 17h16l-2-4v-3a6 6 0 0 0-12 0v3ZM10 20a2 2 0 0 0 4 0",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  calendar: "M3 5h18v16H3zM7 2v6m10-6v6M3 10h18",
  logout: "M10 3H4v18h6m-2-9h13m-5-5 5 5-5 5",
  chart: "M3 3v18h18M7 17v-5m5 5V7m5 10V9",
  file: "M5 2h10l4 5v15H5ZM14 2v6h5M8 12h8M8 16h6",
  camera: "M3 7h4l2-3h6l2 3h4v13H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  x: "M5 5l14 14M19 5 5 19",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.2",
  settings: "M3 6h7m4 0h7M3 12h11m4 0h3M3 18h3m4 0h11M10 3v6m4 0v6m-8 0v6",
  board: "M3 4h18v16H3zM9 4v16m6-16v16",
  crew: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-2a7 7 0 0 1 14 0v2M18 5a3 3 0 0 1 1 5m1 4 2 4",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 5 7 7",
  tag: "M3 4h8l10 10-7 7L3 10ZM7 7h.1",
  star: "m12 3 2.8 5.9 6.5.9-4.7 4.6 1.2 6.5-5.8-3.1-5.8 3.1 1.2-6.5-4.7-4.6 6.5-.9Z",
  flag: "M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0",
  brief: "M3 7h18v13H3zM8 7V4h8v3m-13 5c6 3 12 3 18 0",
};
export function icon(name, size = 20) {
  return (
    '<svg class="ic ' +
    (name === "arrow" ? "directional" : "") +
    '" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
    (drawings[name] || drawings.box) +
    '"/></svg>'
  );
}
export const svcIcon = {
  home: "home",
  furniture: "sofa",
  packing: "box",
  assembly: "tools",
  single: "truck",
};
export const logo = () =>
  '<img class="logo" src="./assets/logo.png" alt="نقلة | Naqla">';
export const link = (url, label, style = "btn primary", ico = "") =>
  '<a class="' +
  style +
  '" href="#/' +
  url +
  '">' +
  (ico ? icon(ico) : "") +
  label +
  "</a>";
export const button = (action, label, style = "btn soft", ico = "") =>
  '<button type="button" class="' +
  style +
  '" data-act="' +
  action +
  '">' +
  (ico ? icon(ico) : "") +
  label +
  "</button>";
export const serviceName = (s) => tr(services[s]);
/** status badge for a move ({status, current_stage}) */
export const badge = (m) =>
  '<span class="badge ' + bucket(m.status, m.current_stage) + '"><i></i>' +
  tr(stages[m.current_stage || m.status]) + "</span>";
export const addr = (a) =>
  [a?.district, a?.city].filter(Boolean).map(esc).join(t("، ", ", "));
export const dateText = (v) =>
  v
    ? new Intl.DateTimeFormat(t("ar-SA-u-ca-gregory", "en-GB"), {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(v.length === 10 ? v + "T12:00:00" : v))
    : "—";
export const money = (v) =>
  new Intl.NumberFormat(t("ar-SA", "en-SA"), {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(v);
export const nameOf = (u) => esc(u?.name || "—");
/** signed-in user from the API (/auth/me), or null */
export const who = () => session.me;
/** prices come from the API in halalas (1 SAR = 100) */
export const sar = (halalas) => money((halalas || 0) / 100);
export const timeText = (v) => (v ? String(v).slice(0, 5) : "");
export const go = (path) => {
  if (location.hash === "#/" + path)
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "/" + path;
};
export const empty = (heading, sub = "", extra = "") =>
  '<div class="empty">' +
  icon("box", 32) +
  "<h3>" +
  heading +
  "</h3><p>" +
  sub +
  "</p>" +
  extra +
  "</div>";
export const head = (eyebrow, title, sub = "", extra = "") =>
  '<header class="pagehead"><div>' +
  (eyebrow ? '<small class="eyebrow">' + eyebrow + "</small>" : "") +
  "<h1>" +
  title +
  "</h1>" +
  (sub ? "<p>" + sub + "</p>" : "") +
  "</div>" +
  extra +
  "</header>";
export const field = (label, input, wide = false) =>
  '<label class="field ' +
  (wide ? "full" : "") +
  '"><span>' +
  label +
  "</span>" +
  input +
  "</label>";
export const inp = (name, value = "", props = "") =>
  '<input name="' + name + '" value="' + esc(value) + '" ' + props + ">";
export const area = (name, value = "", props = "") =>
  '<textarea name="' + name + '" ' + props + ">" + esc(value) + "</textarea>";
export const select = (name, dict, value, props = "") =>
  '<select name="' +
  name +
  '" ' +
  props +
  ">" +
  Object.entries(dict)
    .map(
      ([k, v]) =>
        '<option value="' +
        esc(k) +
        '" ' +
        (k === value ? "selected" : "") +
        ">" +
        esc(Array.isArray(v) ? tr(v) : v) +
        "</option>",
    )
    .join("") +
  "</select>";
export const check = (name, label, on = false, props = "") =>
  '<label class="check"><input type="checkbox" name="' +
  name +
  '" ' +
  (on ? "checked" : "") +
  " " +
  props +
  "><span>" +
  label +
  "</span></label>";
export const formData = (f) => Object.fromEntries(new FormData(f));
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateLine = (m) =>
  dateText(m.date_from) +
  (m.date_to && m.date_to !== m.date_from ? " – " + dateText(m.date_to) : "") +
  (m.preferred_time ? " · " + timeText(m.preferred_time) : "");
export const submit = (label) =>
  '<button class="btn primary" type="submit">' +
  label +
  icon("arrow", 17) +
  "</button>";
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}
export function dialog(title, body) {
  const el = document.querySelector("#dialog");
  el.innerHTML =
    '<div class="dialog-head"><h2 id="dialog-title">' +
    title +
    "</h2>" +
    button(
      "dismiss",
      '<span class="sr">' + t("إغلاق", "Close") + "</span>",
      "iconbtn",
      "x",
    ) +
    "</div>" +
    body;
  el.setAttribute("aria-labelledby", "dialog-title");
  if (!el.open) el.showModal();
}
export function closeDialog() {
  document.querySelector("#dialog").close();
}
const errorMessages = {
  network: ["تعذر الاتصال بالخادم. تحقق من الإنترنت.", "Can't reach the server. Check your connection."],
  required: ["أكمل الحقول المطلوبة.", "Complete the required fields."],
  photo: ["اختر صورة صالحة بحجم أقل من 15 م.ب.", "Choose a valid image under 15 MB."],
  unauthorized: ["البريد أو كلمة المرور غير صحيحة.", "Wrong email or password."],
  email_taken: ["البريد مسجل بالفعل.", "That email is already registered."],
  validation: ["تحقق من البيانات المدخلة.", "Check the details you entered."],
  not_draft: ["تم تأكيد الطلب بالفعل.", "This request is already confirmed."],
  no_photos: ["ارفع صور الغرف أولاً.", "Upload room photos first."],
  too_late_to_cancel: ["لا يمكن الإلغاء بعد انطلاق الفريق.", "You can't cancel once the crew is on the way."],
  backward_stage: ["لا يمكن الرجوع لمرحلة سابقة.", "You can't go back to an earlier stage."],
  not_accepted: ["اقبل الطلب قبل تعيين فني.", "Accept the move before assigning a technician."],
  already_rated: ["تم التقييم مسبقاً.", "Already rated."],
  invalid_google_token: ["تعذر التحقق من حساب Google.", "Google sign-in could not be verified."],
  not_found: ["غير موجود.", "Not found."],
  forbidden: ["غير مسموح.", "Not allowed."],
};
export function errorText(err) {
  const m = errorMessages[err?.code] || errorMessages[err?.message];
  if (m) return t(...m);
  // the API's own (English) message is better than a generic one
  return err?.message && err.message !== err.code
    ? err.message
    : t("تعذر حفظ التغيير. حاول مجدداً.", "The change could not be saved. Try again.");
}
export function checkPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024)
    throw Error("photo");
}
export const toolsBar = () =>
  button("language", t("EN", "عربي"), "utility", "globe") +
  button(
    "theme",
    '<span class="sr">' + t("تغيير المظهر", "Toggle theme") + "</span>",
    "iconbtn",
    document.documentElement.dataset.theme === "dark" ? "sun" : "moon",
  );
