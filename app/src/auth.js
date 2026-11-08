import { api, signIn } from "./api.js";
import {
  t, tr, icon, logo, link, toolsBar, field, inp, submit, go, formData, esc, toast, errorText,
} from "./ui.js";

const roleNames = {
  customer: ["العميل", "Customer"],
  company: ["شركة النقل", "Moving company"],
  tech: ["الفني", "Technician"],
};

// Google is a second option. Android app: native SDK (Credential Manager) through the Capacitor bridge.
const cap = () => window.Capacitor;
const nativeGoogle = () => {
  const c = cap();
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.("NaglaGoogle")) return null;
  return c.Plugins?.NaglaGoogle ?? { signIn: (o) => c.nativePromise("NaglaGoogle", "signIn", o) };
};
let googleStatus = null;
async function loadGoogleStatus() {
  googleStatus ??= await api("GET", "/auth/google/status").catch(() => ({}));
  const box = document.getElementById("googleBox");
  if (box) box.hidden = !(nativeGoogle() ? googleStatus.native : googleStatus.web);
}

export function authPage(role, stage, params) {
  if (!roleNames[role]) role = "customer";
  const register = role === "customer" && stage === "register";
  const next = params.get("next") || "";
  const title = register
    ? t("إنشاء حساب", "Create an account")
    : role === "customer"
      ? t("أهلاً بعودتك", "Welcome back")
      : t("مساحة " + tr(roleNames[role]), tr(roleNames[role]) + " workspace");

  const form =
    '<form data-form="' + (register ? "register" : "login") + '" data-next="' + esc(next) + '">' +
    (register ? field(t("الاسم", "Name"), inp("name", "", 'required maxlength="100" autocomplete="name"')) : "") +
    field(t("البريد الإلكتروني", "Email"),
      inp("email", "", 'type="email" required dir="ltr" maxlength="200" autocomplete="' + (register ? "email" : "username") + '"')) +
    field(t("كلمة المرور", "Password"),
      inp("password", "", 'type="password" required dir="ltr" minlength="' + (register ? 8 : 1) +
        '" maxlength="200" autocomplete="' + (register ? "new-password" : "current-password") + '"')) +
    submit(register ? t("إنشاء الحساب", "Create account") : t("تسجيل الدخول", "Sign in")) +
    "</form>";

  const customerExtras =
    role !== "customer" ? "" :
      '<div class="authlinks">' +
      link("auth/customer/" + (register ? "login" : "register") + (next ? "?next=" + esc(next) : ""),
        register ? t("لدي حساب", "I have an account") : t("إنشاء حساب جديد", "Create an account"), "textlink") +
      "</div>" +
      '<div id="googleBox" hidden><div class="or">' + t("أو", "or") + "</div>" +
      '<button class="btn outline wide" type="button" data-act="google" data-next="' + esc(next) + '">' +
      googleMark() + t("المتابعة باستخدام Google", "Continue with Google") + "</button></div>";

  const staffNote =
    role === "customer" ? "" :
      '<p class="hint">' + t(
        "تُنشئ شركة النقل حسابات موظفيها. استخدم البريد وكلمة المرور التي أعطتك إياها الشركة.",
        "Your moving company creates staff accounts. Use the email and password your company gave you.",
      ) + "</p>";

  setTimeout(loadGoogleStatus);
  return (
    '<header class="publicnav"><div class="container bar"><a href="#/home">' + logo() +
    '</a><div class="navtools">' + toolsBar() + "</div></div></header>" +
    '<main id="content" class="auth-layout" tabindex="-1"><section class="auth-aside"><img src="./assets/moving-truck.webp" alt=""><div>' +
    icon("route", 30) + "<h2>" + t("رحلتك إلى بيتك الجديد.", "Your journey to a new home.") + "</h2></div></section>" +
    '<section class="auth-box"><small class="eyebrow">' + tr(roleNames[role]) + "</small><h1>" + title + "</h1>" +
    staffNote + form + customerExtras +
    '<div class="authroles">' +
    Object.keys(roleNames).filter((r) => r !== role).map((r) => link("auth/" + r, tr(roleNames[r]), "textlink")).join("") +
    "</div></section></main>"
  );
}

const googleMark = () =>
  '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function landAfterSignIn(me, next) {
  if (!me) throw Error("network");
  go(me.role === "customer" && next === "new" ? "new" : "dashboard");
}

export async function handleAuth(kind, f) {
  const data = formData(f);
  const tokens = kind === "register"
    ? await api("POST", "/auth/register", { name: data.name, email: data.email, password: data.password })
    : await api("POST", "/auth/login", { email: data.email, password: data.password });
  landAfterSignIn(await signIn(tokens), f.dataset.next);
}

export async function googleSignIn(el) {
  const native = nativeGoogle();
  if (!native) {
    location.href = "/auth/google"; // web redirect flow; comes back with ?code=
    return;
  }
  el.disabled = true;
  try {
    const { idToken } = await native.signIn({ serverClientId: googleStatus?.client_id });
    landAfterSignIn(await signIn(await api("POST", "/auth/google/native", { id_token: idToken })), el.dataset.next);
  } catch (err) {
    if (err?.code !== "canceled") toast(errorText(err));
  } finally {
    el.disabled = false;
  }
}

/** web redirect flow lands on /app/index.html?code=… */
export async function finishGoogleRedirect() {
  const code = new URLSearchParams(location.search).get("code");
  if (!code) return false;
  history.replaceState(null, "", location.pathname + location.hash);
  try {
    landAfterSignIn(await signIn(await api("POST", "/auth/google/exchange", { code })), "");
  } catch (err) {
    toast(errorText(err));
  }
  return true;
}
