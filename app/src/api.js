// Nagla API client: same origin as the app (the API serves /app/). Tokens in localStorage.
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export const session = {
  get access() { return store.get("naqla.access"); },
  get refresh() { return store.get("naqla.refresh"); },
  /** the signed-in user (GET /auth/me), cached so the UI can render synchronously */
  get me() { try { return JSON.parse(store.get("naqla.me") || "null"); } catch { return null; } },
  save(tokens) {
    store.set("naqla.access", tokens.access_token);
    store.set("naqla.refresh", tokens.refresh_token);
  },
  setMe(me) { store.set("naqla.me", me ? JSON.stringify(me) : null); },
  clear() {
    store.set("naqla.access", null);
    store.set("naqla.refresh", null);
    store.set("naqla.me", null);
  },
};

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let refreshing = null;
async function refreshTokens() {
  if (!session.refresh) return false;
  refreshing ??= fetch("/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh }),
  }).then(async (r) => {
    if (!r.ok) { session.clear(); return false; }
    session.save(await r.json());
    return true;
  }).catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}

/** JSON (or FormData) in, JSON out; bearer token; one silent refresh on 401. */
export async function api(method, path, body, retry = true) {
  const headers = {};
  if (session.access) headers.authorization = "Bearer " + session.access;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "network", "network");
  }
  if (r.status === 401 && retry && session.refresh && (await refreshTokens())) return api(method, path, body, false);
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data?.error || "http_" + r.status, data?.message, data);
  return data;
}

export async function loadMe() {
  const me = session.access || session.refresh ? await api("GET", "/auth/me").catch(() => null) : null;
  session.setMe(me);
  return me;
}

export async function signIn(tokens) {
  session.save(tokens);
  return loadMe();
}

export async function signOut() {
  if (session.refresh) await api("POST", "/auth/logout", { refresh_token: session.refresh }).catch(() => {});
  session.clear();
}

export const key = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
