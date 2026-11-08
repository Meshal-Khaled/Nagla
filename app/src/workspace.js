import { api } from "./api.js";
import { roles, bucket, where } from "./labels.js";
import {
  t, tr, esc, icon, logo, link, button, toolsBar, who, head, nameOf, empty, dateText, dateLine,
  badge, dialog,
} from "./ui.js";
import { moveCard, taskCard } from "./request.js";

/** their stylesheet themes the workspace by role: customer / admin / tech */
export const cssRole = (role) => ({ customer: "customer", company_admin: "admin", agent: "tech" })[role] || "customer";

const navItems = {
  dashboard: ["grid", "الرئيسية", "Home"],
  new: ["plus", "طلب جديد", "New move"],
  bookings: ["list", "طلباتي", "My moves"],
  requests: ["file", "الطلبات", "Moves"],
  team: ["crew", "الفنيون", "Technicians"],
  jobs: ["brief", "المهام", "My tasks"],
  profile: ["user", "الملف الشخصي", "Profile"],
  settings: ["settings", "الإعدادات", "Settings"],
};
const navFor = {
  customer: ["dashboard", "bookings", "new", "profile", "settings"],
  company_admin: ["dashboard", "requests", "team", "profile", "settings"],
  agent: ["dashboard", "jobs", "profile", "settings"],
};
const phoneNav = {
  customer: ["dashboard", "bookings", "new", "profile"],
  company_admin: ["dashboard", "requests", "team", "more"],
  agent: ["dashboard", "jobs", "profile", "more"],
};

function bottomNavigation(role, active) {
  return (
    '<nav class="bottomnav" aria-label="' + t("التنقل الرئيسي", "Main navigation") + '">' +
    phoneNav[role].map((key) => {
      if (key === "more") {
        const selected = !phoneNav[role].includes(active);
        return '<button type="button" data-act="workspace-menu" class="' + (selected ? "active" : "") + '">' +
          icon("menu", 22) + "<span>" + t("المزيد", "More") + "</span></button>";
      }
      const [symbol, ar, en] = navItems[key];
      return '<a href="#/' + key + '" class="' + (key === "new" ? "new-tab " : "") + (key === active ? "active" : "") + '" ' +
        (key === active ? 'aria-current="page"' : "") + ">" + icon(symbol, 22) + "<span>" + t(ar, en) + "</span></a>";
    }).join("") +
    "</nav>"
  );
}

export function workspaceMenu() {
  const role = who().role;
  const options = navFor[role].filter((key) => !phoneNav[role].includes(key));
  dialog(
    t("مساحة العمل", "Workspace"),
    '<nav class="workspace-menu">' +
      options.map((key) => {
        const [symbol, ar, en] = navItems[key];
        return link(key, icon(symbol, 22) + t(ar, en) + icon("arrow", 17), "menu-link");
      }).join("") +
      link("home", icon("home", 22) + t("واجهة نقلة", "Naqla home"), "menu-link") +
      button("logout", t("تسجيل الخروج", "Sign out"), "menu-link danger", "logout") +
      "</nav>",
  );
}

export function shell(content, route) {
  const me = who();
  const active = route === "request" || route === "task"
    ? { customer: "bookings", company_admin: "requests", agent: "jobs" }[me.role]
    : route;
  return (
    '<div class="workspace ' + cssRole(me.role) + '"><div class="workmain">' +
    '<header class="worktop"><a href="#/dashboard" class="app-brand">' + logo() + "</a>" +
    '<span class="workspace-name">' + tr(roles[me.role]) + (me.company_name ? " · " + esc(me.company_name) : "") +
    '</span><div class="navtools">' + toolsBar() +
    link("settings", '<span class="sr">' + t("الإعدادات", "Settings") + "</span>" + icon("settings"), "iconbtn") +
    '</div></header><main id="content" class="workcontent" tabindex="-1">' + content + "</main>" +
    bottomNavigation(me.role, active) +
    "</div></div>"
  );
}

const stat = (url, title, n) => link(url, "<small>" + title + "</small><strong>" + n + "</strong>", "stat");

export async function dashboard() {
  const me = who();
  if (me.role === "agent") return techDashboard(me);
  if (me.role === "company_admin") return companyDashboard(me);
  return customerDashboard(me);
}

async function customerDashboard(me) {
  const moves = await api("GET", "/moves");
  const group = (m) => bucket(m.status, m.current_stage);
  const live = moves.filter((m) => m.status === "confirmed" && !["completed", "rejected", "cancelled"].includes(m.current_stage));
  const next = live.slice().sort((a, b) => String(a.date_from).localeCompare(String(b.date_from)))[0];
  const drafts = moves.filter((m) => m.status === "draft");
  return (
    head(t("مساحة العميل", "Customer workspace"), t("أهلاً، ", "Welcome, ") + nameOf(me),
      t("طلباتك ومواعيدك وتحديثات فريق النقل.", "Your moves, dates and crew updates."),
      link("new", t("طلب نقل جديد", "New moving request"), "btn primary", "plus")) +
    '<div class="mini-kpis">' +
    stat("bookings", t("جميع الطلبات", "All moves"), moves.length) +
    stat("bookings?filter=draft", t("مسودات", "Drafts"), drafts.length) +
    stat("bookings?filter=active", t("نقل نشط", "Active"), live.length) +
    stat("bookings?filter=completed", t("مكتملة", "Completed"), moves.filter((m) => group(m) === "completed").length) +
    "</div>" +
    (next
      ? nextMove(next, "request/" + next.id, t("فتح التتبّع", "Open tracking"))
      : drafts[0]
        ? nextMove(drafts[0], "new/" + drafts[0].id, t("أكمل الطلب", "Continue request"))
        : empty(t("لا توجد نقلة قادمة", "No upcoming move"), t("صوّر غرفك لتبدأ التخطيط.", "Photograph your rooms to start planning."),
          link("new", t("ابدأ نقلتك", "Start moving")))) +
    '<div class="sectionhead"><h2>' + t("آخر الطلبات", "Recent moves") + "</h2>" +
    link("bookings", t("عرض الكل", "View all"), "textlink") + '</div><div class="cards">' +
    (moves.slice(0, 3).map((m) => moveCard(m)).join("") || empty(t("لا توجد طلبات بعد", "No moves yet"))) +
    "</div>"
  );
}

function nextMove(m, url, label) {
  return (
    '<div class="nextmove"><div><span class="eyebrow">' + t("النقلة القادمة", "Upcoming move") +
    (m.move_no ? " · #" + m.move_no : "") + "</span><h2>" +
    esc(m.pickup_address || t("عنوان الاستلام", "Pickup address")) + " " + icon("arrow") + " " +
    esc(m.dropoff_address || t("عنوان التسليم", "Delivery address")) + "</h2><p>" +
    icon("calendar", 18) + (m.date_from ? dateLine(m) : t("لم يُحدّد الموعد", "No date yet")) + "</p>" + badge(m) + "</div>" +
    link(url, label + icon("arrow", 16), "btn lime") + "</div>"
  );
}

async function companyDashboard(me) {
  const moves = await api("GET", "/company/moves?scope=all");
  const is = (scope) => moves.filter((m) => companyScope(m) === scope);
  const incoming = is("incoming");
  return (
    head(t("مساحة الشركة", "Company workspace"), esc(me.company_name || me.name),
      t("الطلبات الواردة والنقل الجاري وفريق الفنيين.", "Incoming requests, moves in progress and your technicians."),
      link("requests?scope=incoming", t("الطلبات الواردة", "Incoming"), "btn primary", "file")) +
    '<div class="mini-kpis">' +
    stat("requests?scope=incoming", t("بانتظار القبول", "To accept"), incoming.length) +
    stat("requests?scope=assign", t("بحاجة لفني", "Need a technician"), moves.filter((m) => m.current_stage === "accepted").length) +
    stat("requests?scope=active", t("قيد التنفيذ", "In progress"), is("active").length) +
    stat("requests?scope=closed", t("منتهية", "Closed"), is("closed").length) +
    "</div>" +
    '<div class="sectionhead"><h2>' + t("بانتظار قرارك", "Waiting for you") + "</h2>" +
    link("requests", t("عرض الكل", "View all"), "textlink") + '</div><div class="cards">' +
    (moves.filter((m) => ["confirmed", "accepted"].includes(m.current_stage)).slice(0, 4).map((m) => moveCard(m)).join("") ||
      empty(t("لا توجد طلبات بانتظارك", "Nothing waiting for you"))) +
    "</div>"
  );
}

export const companyScope = (m) =>
  m.current_stage === "confirmed" ? "incoming"
    : ["completed", "rejected", "cancelled"].includes(m.current_stage) ? "closed" : "active";

async function techDashboard(me) {
  const [s, tasks] = await Promise.all([api("GET", "/tech/summary"), api("GET", "/tech/tasks?scope=all")]);
  return (
    head(t("مساحة الفني", "Technician workspace"), t("أهلاً، ", "Hello, ") + esc(s.name),
      t("ملخص اليوم ومهامك المسندة.", "Today's summary and your assigned tasks."),
      link("jobs", t("عرض المهام", "View tasks"), "btn primary", "brief")) +
    '<div class="mini-kpis">' +
    stat("jobs?scope=assigned", t("مسندة", "Assigned"), s.counts.assigned) +
    stat("jobs?scope=in_progress", t("قيد التنفيذ", "In progress"), s.counts.in_progress) +
    stat("jobs?scope=completed", t("مكتملة", "Completed"), s.counts.completed) +
    "</div>" +
    (s.next_task
      ? '<div class="nextmove"><div><span class="eyebrow">' + t("المهمة التالية", "Next task") + " · #" + s.next_task.move_no +
        "</span><h2>" + esc(s.next_task.pickup_address) + " " + icon("arrow") + " " + esc(s.next_task.dropoff_address) +
        "</h2><p>" + icon("calendar", 18) + dateLine(s.next_task) + "</p>" + badge(s.next_task) + "</div>" +
        link("task/" + s.next_task.id, t("فتح المهمة", "Open task") + icon("arrow", 16), "btn lime") + "</div>"
      : empty(t("لا توجد مهام مفتوحة", "No open tasks"), t("ستظهر مهامك عندما تسندها إليك الشركة.", "Tasks appear when your company assigns them."))) +
    '<div class="sectionhead"><h2>' + t("آخر المهام", "Recent tasks") + "</h2>" +
    link("jobs", t("عرض الكل", "View all"), "textlink") + '</div><div class="cards">' +
    (tasks.slice(0, 3).map(taskCard).join("") || empty(t("لا توجد مهام بعد", "No tasks yet"))) + "</div>"
  );
}

export async function profile(settings) {
  const me = who();
  if (settings)
    return (
      head(t("التفضيلات", "Preferences"), t("الإعدادات", "Settings")) +
      '<div class="panel settings"><div class="settingrow"><div><h3>' + t("اللغة والمظهر", "Language & appearance") + "</h3><p>" +
      t("تُطبق تفضيلاتك على هذا الجهاز.", "Your choices apply on this device.") + '</p></div><div class="navtools">' +
      toolsBar() + '</div></div><div class="settingrow">' +
      link("profile", t("الملف الشخصي", "Profile"), "textlink") +
      button("logout", t("تسجيل الخروج", "Sign out"), "btn outline", "logout") + "</div></div>"
    );
  const tech = me.role === "agent" ? await api("GET", "/tech/profile") : null;
  const row = (k, v) => '<div class="bill-line"><span>' + k + "</span><bdi>" + v + "</bdi></div>";
  return (
    head(tr(roles[me.role]), t("الملف الشخصي", "My profile")) +
    '<div class="panel">' +
    row(t("الاسم", "Name"), esc(me.name)) +
    row(t("البريد الإلكتروني", "Email"), esc(me.email)) +
    (me.company_name ? row(t("الشركة", "Company"), esc(me.company_name)) : "") +
    "</div>" +
    (tech
      ? '<div class="mini-kpis">' +
        '<div class="stat"><small>' + t("نقل مكتمل", "Completed moves") + "</small><strong>" + tech.completed_moves + "</strong></div>" +
        '<div class="stat"><small>' + t("التقييم", "Rating") + " (" + tech.rating.count + ")</small><strong>" + (tech.rating.average ?? "—") + "</strong></div>" +
        '<div class="stat"><small>' + t("متوسط مدة المهمة", "Avg job") + "</small><strong>" +
        (tech.performance.avg_job_minutes != null ? tech.performance.avg_job_minutes + t(" د", " min") : "—") + "</strong></div>" +
        '<div class="stat"><small>' + t("آخر ٣٠ يوماً", "Last 30 days") + "</small><strong>" + tech.performance.completed_last_30_days + "</strong></div>" +
        '</div><div class="panel"><h2>' + t("آخر التقييمات", "Recent reviews") + "</h2>" +
        (tech.recent_reviews.map((r) =>
          '<div class="bill-line"><span>' + "★".repeat(r.stars) + "☆".repeat(5 - r.stars) + " " + esc(r.comment || "") +
          "</span><bdi>#" + r.move_no + "</bdi></div>").join("") || "<p>" + t("لا توجد تقييمات بعد.", "No reviews yet.") + "</p>") +
        "</div>"
      : "") +
    '<div class="panel">' + link("settings", t("الإعدادات", "Settings"), "textlink") +
    button("logout", t("تسجيل الخروج", "Sign out"), "btn outline", "logout") + "</div>"
  );
}

export { dateText };
