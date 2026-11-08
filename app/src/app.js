import { loadMe, signOut, session } from "./api.js";
import { lang, t, link, empty, go, who, closeDialog, toast, errorText } from "./ui.js";
import { landing } from "./landing.js";
import { authPage, handleAuth, googleSignIn, finishGoogleRedirect } from "./auth.js";
import {
  bookingPage, uploadPhotos, runDetection, itemChanged, catalogDialog, saveDetails, confirmDialog, confirmMove,
} from "./booking.js";
import {
  requestDetail, taskDetail, customerList, companyList, techList, teamPage, agentDialog, cancelDialog, jobSheetDialog,
  setStage, setTechStage, submitForm,
} from "./request.js";
import { shell, dashboard, profile, workspaceMenu } from "./workspace.js";
import { api } from "./api.js";

const app = document.getElementById("app");

function path() {
  const [pathname, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [page = "home", id = "", stage = ""] = pathname.split("/");
  return { page: page || "home", id, stage, params: new URLSearchParams(query) };
}

function themed() {
  document.documentElement.lang = lang();
  document.documentElement.dir = lang() === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.theme = localStorage.getItem("naqla.theme") || "light";
}

const unavailable = () =>
  empty(t("الصفحة غير متاحة", "Page unavailable"), "", link("dashboard", t("ارجع إلى الرئيسية", "Back to home")));

// which pages each role may open
const allowed = {
  customer: ["dashboard", "new", "bookings", "request", "profile", "settings"],
  company_admin: ["dashboard", "requests", "request", "team", "profile", "settings"],
  agent: ["dashboard", "jobs", "task", "profile", "settings"],
};

async function content(p, me) {
  if (!allowed[me.role]?.includes(p.page)) return unavailable();
  switch (p.page) {
    case "dashboard": return dashboard();
    case "new": return bookingPage(p.id, p.params);
    case "bookings": return customerList(p.params);
    case "requests": return companyList(p.params);
    case "jobs": return techList(p.params);
    case "team": return teamPage();
    case "request": return requestDetail(p.id);
    case "task": return taskDetail(p.id);
    case "profile":
    case "settings": return profile(p.page === "settings");
  }
  return unavailable();
}

let renderNo = 0;
async function render({ quiet = false } = {}) {
  themed();
  const p = path(), mine = ++renderNo;
  let html;
  try {
    if (p.page === "home") html = landing();
    else if (p.page === "auth") html = authPage(p.id || "customer", p.stage, p.params);
    else {
      const me = who();
      if (!me) {
        html = authPage("customer", "", new URLSearchParams());
      } else {
        if (!quiet && !app.querySelector(".workspace")) app.innerHTML = '<div class="skeleton" role="status">نقلة · Naqla</div>';
        const inner = await content(p, me);
        html = inner === "" ? "" : shell(inner, p.page); // "" = the page redirected
      }
    }
  } catch (err) {
    if (err?.status === 401) {
      session.clear();
      html = authPage("customer", "", new URLSearchParams());
    } else {
      console.error(err);
      html = who()
        ? shell(empty(t("تعذر فتح الصفحة", "Could not open this page"), errorText(err), link("dashboard", t("الرئيسية", "Home"))), p.page)
        : '<main id="content" class="container panel"><h1>' + t("تعذر الاتصال", "Could not connect") + "</h1><p>" + errorText(err) + "</p></main>";
    }
  }
  if (mine !== renderNo || html === "") return; // a newer navigation won, or the page redirected
  // keep scroll + chat position on background refreshes
  const chatBottom = (() => { const c = document.getElementById("chat"); return !c || c.scrollTop + c.clientHeight >= c.scrollHeight - 8; })();
  const y = window.scrollY;
  app.innerHTML = html;
  const chat = document.getElementById("chat");
  if (chat && chatBottom) chat.scrollTop = chat.scrollHeight;
  if (quiet) window.scrollTo(0, y);
  document.title = (app.querySelector("h1")?.textContent || "نقلة") + " | Naqla";
}

function routeChanged() {
  if (document.querySelector("#dialog").open) closeDialog();
  render().then(() => {
    const { params, page } = path(), section = params.get("section");
    requestAnimationFrame(() => {
      if (page === "home" && ["services", "faq", "how"].includes(section)) document.getElementById(section)?.scrollIntoView();
      else window.scrollTo(0, 0);
      document.getElementById("content")?.focus({ preventScroll: true });
    });
  });
}

function showError(err, form) {
  const msg = errorText(err);
  toast(msg);
  if (form) {
    let p = form.querySelector(".form-error");
    if (!p) {
      p = document.createElement("p");
      p.className = "form-error";
      p.setAttribute("role", "alert");
      form.prepend(p);
    }
    p.textContent = msg;
  }
}

// live pages refresh in the background (tracking, tasks, chat), never while the user is typing
setInterval(() => {
  const { page } = path();
  if (!["request", "task", "dashboard", "requests", "jobs"].includes(page) || !who()) return;
  if (document.hidden || document.querySelector("#dialog").open) return;
  const active = document.activeElement;
  if (active && active.closest("form") && (active.value || active.tagName === "SELECT")) return;
  render({ quiet: true });
}, 8000);

document.addEventListener("input", (e) => {
  if (e.target.setCustomValidity) e.target.setCustomValidity("");
});

document.addEventListener("change", (e) => {
  if (e.target.matches("[data-item][data-field]")) itemChanged(e.target);
});

document.addEventListener("click", async (e) => {
  if (e.target.closest(".skip")) {
    e.preventDefault();
    document.getElementById("content")?.focus();
    return;
  }
  const target = e.target.closest("[data-act]");
  if (!target) return;
  const action = target.dataset.act, id = target.dataset.id;
  try {
    switch (action) {
      case "language":
        localStorage.setItem("naqla.lang", lang() === "ar" ? "en" : "ar");
        return render({ quiet: true });
      case "theme":
        localStorage.setItem("naqla.theme", document.documentElement.dataset.theme === "dark" ? "light" : "dark");
        return render({ quiet: true });
      case "workspace-menu": return workspaceMenu();
      case "mobile-menu": {
        const menu = document.querySelector(".mobilelinks");
        menu.hidden = !menu.hidden;
        target.setAttribute("aria-expanded", String(!menu.hidden));
        return;
      }
      case "logout":
        closeDialog();
        await signOut();
        return go("home");
      case "dismiss": return closeDialog();
      case "google": return googleSignIn(target);
      // booking
      case "step": return go("new/" + id + "?step=" + target.dataset.i);
      case "photo-delete":
        await api("DELETE", "/photos/" + id);
        return render({ quiet: true });
      case "detect": target.disabled = true; return await runDetection(id).finally(() => { target.disabled = false; });
      case "item-delete":
        await api("DELETE", "/items/" + id);
        return render({ quiet: true });
      case "catalog": return catalogDialog(id);
      case "catalog-add":
        await api("POST", "/moves/" + target.dataset.move + "/items", { catalog_id: id });
        closeDialog();
        toast(t("تمت الإضافة", "Added"));
        return render({ quiet: true });
      case "confirm": return confirmDialog(target);
      case "confirm-go": target.disabled = true; return await confirmMove(target);
      // tracking
      case "stage": target.disabled = true; await setStage(id, target.dataset.stage); return render({ quiet: true });
      case "tech-stage": await setTechStage(target); return render({ quiet: true });
      case "cancel": return cancelDialog(id);
      case "cancel-confirm":
        await api("POST", "/moves/" + id + "/cancel", {});
        closeDialog();
        toast(t("تم إلغاء الطلب", "Move cancelled"));
        return render({ quiet: true });
      case "job-sheet": return jobSheetDialog(id);
      case "agent-add": return agentDialog();
    }
  } catch (err) {
    target.disabled = false;
    showError(err, target.closest("form"));
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  if (f.dataset.busy) return;
  f.dataset.busy = "1";
  const kind = f.dataset.form;
  try {
    if (kind === "login" || kind === "register") await handleAuth(kind, f);
    else if (kind === "photos") { await uploadPhotos(f); await render({ quiet: true }); }
    else if (kind === "details") await saveDetails(f);
    else if (kind === "catalog-search") await catalogDialog(f.dataset.id, new FormData(f).get("q") || "");
    else { await submitForm(kind, f); await render({ quiet: true }); }
  } catch (err) {
    showError(err, f);
  } finally {
    delete f.dataset.busy;
  }
});

window.addEventListener("hashchange", routeChanged);

// boot: finish a Google web sign-in, refresh who is signed in, then draw
(async () => {
  themed();
  if (await finishGoogleRedirect()) return;
  if (session.access || session.refresh) await loadMe();
  await render();
  if (path().page === "home" && path().params.has("section")) routeChanged();
})();
