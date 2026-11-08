// Tiny API client for the dev UI. Same origin as the API.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export const auth = {
  get access() { return store.get('nagla.access'); },
  get refresh() { return store.get('nagla.refresh'); },
  save(t) { store.set('nagla.access', t.access_token); store.set('nagla.refresh', t.refresh_token); },
  clear() { store.set('nagla.access', null); store.set('nagla.refresh', null); },
};

export function banner(msg, ok = false) {
  let el = document.getElementById('banner');
  if (!el) { el = document.createElement('div'); el.id = 'banner'; document.body.append(el); }
  el.textContent = msg;
  el.className = ok ? 'ok' : '';
  el.style.display = 'block';
  clearTimeout(banner.t);
  banner.t = setTimeout(() => (el.style.display = 'none'), ok ? 2500 : 6000);
}

async function refreshTokens() {
  if (!auth.refresh) return false;
  const r = await fetch('/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: auth.refresh }) });
  if (!r.ok) { auth.clear(); return false; }
  auth.save(await r.json());
  return true;
}

/** fetch wrapper: JSON in/out, bearer token, one silent refresh on 401, errors shown in the banner. */
export async function api(method, path, body, { quiet = false, retry = true } = {}) {
  const headers = {};
  if (auth.access) headers.authorization = `Bearer ${auth.access}`;
  let payload = body;
  if (body && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(path, { method, headers, body: payload });
  if (r.status === 401 && retry && (await refreshTokens())) return api(method, path, body, { quiet, retry: false });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const msg = data?.message || `${r.status} ${r.statusText}`;
    if (!quiet) banner(`${method} ${path}: ${msg}`);
    const err = new Error(msg); err.status = r.status; err.data = data; throw err;
  }
  return data;
}

export const sar = (halalas) => `${(halalas / 100).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} SAR`;
export const nice = (s) => String(s ?? '').replace(/_/g, ' ');
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);

/** Header with the signed-in user; redirects to login when required and missing. */
export async function header(requireRole) {
  const me = auth.access ? await api('GET', '/auth/me', null, { quiet: true }).catch(() => null) : null;
  if (requireRole && (!me || !requireRole.includes(me.role))) { location.href = 'index.html'; return null; }
  const h = document.createElement('header');
  h.innerHTML = `<b>Nagla dev UI</b>
    ${me?.role === 'customer' ? '<a href="moves.html">My moves</a>' : ''}
    ${me?.role === 'company_admin' ? '<a href="company.html">Company</a>' : ''}
    ${me?.role === 'agent' ? '<a href="tech.html">My tasks</a>' : ''}
    <span class="muted small">${me ? `${esc(me.name)} · ${esc(me.role)}${me.company_name ? ' · ' + esc(me.company_name) : ''}` : 'not signed in'}</span>
    ${me ? '<button id="logout">Log out</button>' : ''}`;
  document.body.prepend(h);
  h.querySelector('#logout')?.addEventListener('click', async () => {
    if (auth.refresh) await api('POST', '/auth/logout', { refresh_token: auth.refresh }, { quiet: true }).catch(() => {});
    auth.clear(); location.href = 'index.html';
  });
  return me;
}
