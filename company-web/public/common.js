// Shared by the company page (app.js) and the technician page (tech.js): language, formatting, stage names and the
// API client (through the local server's /api proxy). The page defines signOut(message).
'use strict';

// ---------- language
let lang = localStorage.getItem('naqla.portal.lang') || 'ar';
const t = (ar, en) => (lang === 'ar' ? ar : en);
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach((el) => { const [ar, en] = el.dataset.t.split('|'); el.textContent = t(ar, en); });
  document.querySelectorAll('.lang-toggle').forEach((b) => { b.textContent = lang === 'ar' ? 'English' : 'العربية'; });
  const [ar, en] = (document.documentElement.dataset.title || 'نقلة · بوابة الشركات|Naqla · Company portal').split('|');
  document.title = t(ar, en);
}
document.querySelectorAll('.lang-toggle').forEach((b) => b.addEventListener('click', () => {
  lang = lang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('naqla.portal.lang', lang);
  applyLang();
  window.onLangChange?.(); // each page redraws its own content
}));

// ---------- helpers
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
const sar = (h) => (h == null ? '—' : t(`${(h / 100).toLocaleString('ar-SA-u-nu-latn')} ر.س`, `SAR ${(h / 100).toLocaleString('en')}`));
const date = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
function time12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? t('ص', 'AM') : t('م', 'PM')}`;
}
const truck = (n) => ({ small: t('صغيرة', 'Small'), medium: t('متوسطة', 'Medium'), large: t('كبيرة', 'Large') }[n] ?? n ?? '—');

const STAGES = {
  confirmed: ['بانتظار قبولكم', 'Waiting for you'], accepted: ['تم القبول', 'Accepted'], crew_assigned: ['تم تعيين الفني', 'Technician assigned'],
  on_the_way: ['الفريق في الطريق', 'Crew on the way'], arrived_pickup: ['وصل للاستلام', 'At pickup'], loading: ['جارٍ التحميل', 'Loading'],
  loaded: ['تم التحميل', 'Loaded'], in_transit: ['في الطريق للوجهة', 'In transit'], arrived_destination: ['وصل للوجهة', 'At destination'],
  unloading: ['جارٍ التفريغ', 'Unloading'], completed: ['مكتمل', 'Completed'], rejected: ['مرفوض', 'Rejected'], cancelled: ['ملغى', 'Cancelled'],
};
const stageName = (s) => (STAGES[s] ? t(...STAGES[s]) : s ?? '—');
const stageGroup = (s) => (s === 'confirmed' ? 'pending' : s === 'completed' ? 'done' : s === 'rejected' || s === 'cancelled' ? 'off' : 'active');
const badge = (s) => `<span class="badge ${stageGroup(s)}">${esc(stageName(s))}</span>`;

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg; el.className = 'toast' + (isError ? ' error' : ''); el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- API (tokens in sessionStorage: signing out of the browser tab signs out of the portal)
const store = {
  get access() { return sessionStorage.getItem('naqla.access'); }, set access(v) { v ? sessionStorage.setItem('naqla.access', v) : sessionStorage.removeItem('naqla.access'); },
  get refresh() { return sessionStorage.getItem('naqla.refresh'); }, set refresh(v) { v ? sessionStorage.setItem('naqla.refresh', v) : sessionStorage.removeItem('naqla.refresh'); },
};
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

async function raw(method, path, body, auth = true) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && store.access) headers.authorization = `Bearer ${store.access}`;
  const r = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, data };
}
let refreshing = null;
async function api(method, path, body) {
  let res = await raw(method, path, body);
  if (res.status === 401 && store.refresh) {
    refreshing ??= raw('POST', '/auth/refresh', { refresh_token: store.refresh }, false).finally(() => { refreshing = null; });
    const r = await refreshing;
    if (r.status === 200) { store.access = r.data.access_token; store.refresh = r.data.refresh_token; res = await raw(method, path, body); }
    else { signOut(t('انتهت الجلسة، سجّل الدخول مجدداً.', 'Your session ended. Please sign in again.')); throw new ApiError(401, 'unauthorized', 'signed out'); }
  }
  if (res.status < 200 || res.status > 299) throw new ApiError(res.status, res.data?.error ?? `http_${res.status}`, res.data?.message ?? `Error ${res.status}`);
  return res.data;
}
function errorText(e) {
  if (e.code === 'network') return t('تعذر الاتصال بخادم نقلة.', "Can't reach the Naqla server.");
  return e.message || String(e);
}

