// Naqla technician page: the tasks the company assigned to me, and the stage-by-stage status updates
// (on the way → at pickup → loading → loaded → in transit → at destination → unloading → completed), with an
// optional photo, the customer chat, and rating the customer at the end. Same API as the technician app.
'use strict';

const state = { me: null, scope: 'assigned', tasks: [], summary: null, selected: null, task: null, messages: [], lastChat: '' };
window.onLangChange = () => { if (state.me) { renderList(); renderTask(); } };

const ACTION = {
  on_the_way: ['انطلقت إلى العميل', 'Start driving'], arrived_pickup: ['وصلت للاستلام', 'Arrived at pickup'],
  loading: ['بدء التحميل', 'Start loading'], loaded: ['تم التحميل', 'Loaded'], in_transit: ['بدء الرحلة', 'Start transit'],
  arrived_destination: ['وصلت للوجهة', 'Arrived at delivery'], unloading: ['بدء التفريغ', 'Start unloading'], completed: ['تم التسليم', 'Complete the move'],
};
const action = (s) => (ACTION[s] ? t(...ACTION[s]) : stageName(s));
const SERVICES = { moving: ['نقل', 'Moving'], disassembly: ['فك', 'Disassembly'], assembly: ['تركيب', 'Assembly'], fragile_packing: ['تغليف القطع القابلة للكسر', 'Fragile packing'] };

// ---------- sign in / out
$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const err = $('#login-error'); err.hidden = true;
  const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    const res = await raw('POST', '/auth/login', { email: String(f.get('email')).trim(), password: f.get('password') }, false);
    if (res.status !== 200) throw new ApiError(res.status, res.data?.error, res.data?.message);
    store.access = res.data.access_token; store.refresh = res.data.refresh_token;
    await start();
  } catch (e) {
    err.textContent = e.status === 401 ? t('البريد أو كلمة المرور غير صحيحة.', 'Wrong email or password.') : errorText(e);
    err.hidden = false;
  } finally { btn.disabled = false; }
});
$('#logout').addEventListener('click', () => {
  if (store.refresh) raw('POST', '/auth/logout', { refresh_token: store.refresh }, false).catch(() => {});
  signOut();
});
function signOut(message) {
  store.access = null; store.refresh = null; state.me = null; state.selected = null; state.task = null;
  clearInterval(start.timer);
  $('#app').hidden = true; $('#login').hidden = false;
  if (message) { $('#login-error').textContent = message; $('#login-error').hidden = false; }
}

async function start() {
  const me = await api('GET', '/auth/me');
  if (me.role === 'company_admin') { location.href = 'index.html'; return; } // admins use the company page
  if (me.role !== 'agent') { signOut(t('هذه الصفحة للفنيين فقط.', 'This page is for technicians only.')); return; }
  state.me = me;
  $('#tech-name').textContent = me.name;
  $('#tech-company').textContent = `${me.company_name ?? ''} · ${me.email}`;
  $('#login').hidden = true; $('#app').hidden = false;
  await refreshAll();
  clearInterval(start.timer);
  start.timer = setInterval(() => refreshAll(true), 8000); // new tasks from the company show up by themselves
}

// ---------- list
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { state.scope = b.dataset.scope; renderList(); }));

async function refreshAll(quiet = false) {
  try {
    const [summary, tasks] = await Promise.all([api('GET', '/tech/summary'), api('GET', '/tech/tasks?scope=all')]);
    const known = new Set(state.tasks.map((x) => x.id));
    const fresh = tasks.filter((x) => !known.has(x.id));
    if (quiet && state.tasks.length && fresh.length) toast(t(`مهمة جديدة #${fresh[0].move_no}`, `New task #${fresh[0].move_no}`));
    state.summary = summary; state.tasks = tasks;
    $('.live').classList.remove('off');
    renderList();
    if (state.selected) await loadTask(state.selected, true);
  } catch (e) {
    $('.live').classList.add('off');
    if (!quiet) toast(errorText(e), true);
  }
}

function renderList() {
  const c = state.summary?.counts ?? {};
  $('#summary').innerHTML = `
    <div class="fact"><b>${esc(c.assigned ?? 0)}</b><span>${t('مُسندة', 'Assigned')}</span></div>
    <div class="fact"><b>${esc(c.in_progress ?? 0)}</b><span>${t('قيد التنفيذ', 'In progress')}</span></div>
    <div class="fact"><b>${esc(c.completed ?? 0)}</b><span>${t('مكتملة', 'Completed')}</span></div>`;
  for (const s of ['assigned', 'in_progress', 'completed']) $(`#count-${s}`).textContent = state.tasks.filter((x) => x.bucket === s).length;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scope === state.scope)));
  const list = state.tasks.filter((x) => x.bucket === state.scope);
  if (!list.length) {
    $('#list').innerHTML = `<div class="empty">${esc({
      assigned: t('لا توجد مهام مُسندة إليك الآن. عندما تُعيّنك الشركة تظهر هنا.', 'No tasks assigned to you right now. When your company assigns you, they show up here.'),
      in_progress: t('لا توجد مهام قيد التنفيذ.', 'No tasks in progress.'),
      completed: t('لا توجد مهام مكتملة بعد.', 'No completed tasks yet.'),
    }[state.scope])}</div>`;
    return;
  }
  $('#list').innerHTML = list.map((x) => `
    <button class="move-card ${x.id === state.selected ? 'selected' : ''}" data-id="${esc(x.id)}">
      <div class="row"><span class="move-no">#${esc(x.move_no)}</span>${badge(x.current_stage)}</div>
      <div class="row"><strong>${esc(x.customer_name)}</strong><span class="muted">· ${esc(date(x.date_from))}${x.preferred_time ? ' · ' + esc(time12(x.preferred_time)) : ''}</span></div>
      <div class="addr">⬤ ${esc(x.pickup_address)}</div>
      <div class="addr">◯ ${esc(x.dropoff_address)}</div>
      <div class="bar"><span style="width:${Number(x.progress?.percent ?? 0)}%"></span></div>
    </button>`).join('');
  document.querySelectorAll('.move-card').forEach((el) => el.addEventListener('click', () => select(el.dataset.id)));
}

// ---------- task
async function select(id) {
  state.selected = id; state.lastChat = '';
  renderList();
  $('#detail').innerHTML = `<div class="empty">${t('جارٍ التحميل…', 'Loading…')}</div>`;
  await loadTask(id);
}

async function loadTask(id, quiet = false) {
  try {
    const [task, messages] = await Promise.all([api('GET', `/tech/tasks/${id}`), api('GET', `/moves/${id}/messages`).catch(() => [])]);
    if (state.selected !== id) return;
    const changed = !state.task || state.task.current_stage !== task.current_stage || state.task.id !== task.id || !!state.task.client_rating !== !!task.client_rating;
    state.task = task; state.messages = messages;
    if (!quiet || changed) renderTask(); else renderChat();
  } catch (e) {
    if (!quiet) $('#detail').innerHTML = `<div class="card"><p class="error">${esc(errorText(e))}</p></div>`;
  }
}

function place(label, p) {
  return `<dt>${label}</dt><dd>${esc(p.address ?? '—')}<br><span class="muted">${t('الطابق', 'Floor')} ${esc(p.floor ?? 0)} · ${p.has_elevator ? t('يوجد مصعد', 'elevator') : t('بدون مصعد', 'no elevator')}</span>
    ${p.navigation_url ? ` · <a href="${esc(p.navigation_url)}" target="_blank" rel="noopener">${t('الملاحة', 'Navigate')} ↗</a>` : ''}</dd>`;
}

function renderTask() {
  const x = state.task; if (!x) return;
  const stage = x.current_stage;
  const next = x.recommended_next;
  const closed = ['completed', 'rejected', 'cancelled'].includes(stage);
  const notYet = stage === 'confirmed';

  // the one big button for the next stage (the API also allows skipping ahead; the skipped stages are logged)
  let actions = '';
  if (next) {
    actions = `<div class="actions">
        <button class="btn primary" data-stage="${esc(next)}">${esc(action(next))}</button>
        <label class="btn ghost" style="flex-direction:row;align-items:center;gap:8px;font-weight:600">📷 <span>${t('إرفاق صورة (اختياري)', 'Attach a photo (optional)')}</span>
          <input type="file" id="photo" accept="image/*" capture="environment" hidden></label>
        <span class="muted" id="photo-name"></span>
      </div>
      ${x.next_stages.length > 1 ? `<details><summary class="muted">${t('مراحل أخرى', 'Other stages')}</summary><div class="actions" style="margin-top:8px">${x.next_stages.slice(1).map((s) => `<button class="btn" data-stage="${esc(s)}">${esc(action(s))}</button>`).join('')}</div>
        <p class="note">${t('تخطي مرحلة يسجّل المراحل التي قبلها كمتخطاة.', 'Jumping ahead logs the stages in between as skipped.')}</p></details>` : ''}`;
  } else if (notYet) {
    actions = `<p class="note">${t('لم تقبل الشركة هذا الطلب بعد.', "The company hasn't accepted this move yet.")}</p>`;
  } else if (stage === 'completed' && !x.client_rating) {
    actions = `<div class="actions"><span>${t('قيّم العميل:', 'Rate the customer:')}</span>${[1, 2, 3, 4, 5].map((n) => `<button class="btn" data-stars="${n}">${'★'.repeat(n)}</button>`).join('')}</div>`;
  } else if (x.client_rating) {
    actions = `<p class="note">${t('قيّمت العميل: ', 'You rated the customer: ')}${'★'.repeat(x.client_rating.stars)}</p>`;
  }

  const events = new Map(x.events.map((e) => [e.stage, e]));
  const checklist = x.statuses.map((s) => {
    const ev = events.get(s.stage);
    const cls = s.done ? 'done' : s.stage === next ? 'now' : 'todo';
    return `<li class="${cls}"><span class="dot">${s.done ? '✓' : ''}</span>
      <span><span class="label">${esc(stageName(s.stage))}</span>${ev?.skipped ? ` <span class="skipped">(${t('تم تخطيها', 'skipped')})</span>` : ''}
      ${ev?.photo_url ? ` · <a href="/api${esc(ev.photo_url)}" target="_blank" rel="noopener">${t('صورة', 'photo')}</a>` : ''}</span>
      <time>${ev ? esc(dateTime(ev.created_at)) : ''}</time></li>`;
  }).join('');

  const q = x.quote;
  $('#detail').innerHTML = `
    <div class="card">
      <div class="head"><h2>#${esc(x.move_no)}</h2>${badge(stage)}<span class="muted" style="margin-inline-start:auto">${t('العميل', 'Customer')}: <strong>${esc(x.customer?.name)}</strong></span></div>
      <div class="facts">
        <div class="fact"><b>${esc(date(x.schedule.date_from))}</b><span>${x.schedule.preferred_time ? esc(time12(x.schedule.preferred_time)) : t('الموعد', 'Date')}</span></div>
        <div class="fact"><b>${q?.volume_m3 != null ? esc(Number(q.volume_m3).toFixed(1)) + ' m³' : '—'}</b><span>${t('الحجم', 'Volume')}</span></div>
        <div class="fact"><b>${esc(truck(q?.truck_name))}${q?.trips > 1 ? ' × ' + esc(q.trips) : ''}</b><span>${t('الشاحنة', 'Truck')} · ${t('عمال', 'crew')} ${esc(q?.crew_size ?? '—')}</span></div>
        <div class="fact"><b>${esc(x.job_sheet?.totals?.items ?? x.job_sheet?.load_order?.length ?? 0)}</b><span>${t('قطع', 'Items')}</span></div>
      </div>
      ${actions}
    </div>
    <div class="two">
      <div class="card">
        <h3>${t('مراحل النقل', 'Move stages')}</h3>
        <ol class="timeline">${checklist}</ol>
      </div>
      <div class="card">
        <h3>${t('العناوين', 'Addresses')}</h3>
        <dl class="kv">${place(t('الاستلام', 'Pickup'), x.pickup)}${place(t('التسليم', 'Delivery'), x.dropoff)}
          ${x.notes ? `<dt>${t('ملاحظات', 'Notes')}</dt><dd>${esc(x.notes)}</dd>` : ''}
          <dt>${t('الخدمات', 'Services')}</dt><dd>${x.services.map((s) => esc(SERVICES[s] ? t(...SERVICES[s]) : s)).join('، ')}</dd>
        </dl>
        <h3>${t('المحادثة مع العميل', 'Chat with the customer')}</h3>
        <div class="chat-log" id="chat-log"></div>
        <form class="chat-form" id="chat-form"><input id="chat-input" maxlength="2000" placeholder="${t('اكتب رسالة…', 'Write a message…')}" autocomplete="off"><button class="btn primary">${t('إرسال', 'Send')}</button></form>
      </div>
    </div>
    <div class="card">
      <h3>${t('ترتيب التحميل', 'Load order')}</h3>
      <table><thead><tr><th>#</th><th>${t('القطعة', 'Item')}</th><th>${t('الكمية', 'Qty')}</th><th></th></tr></thead>
      <tbody>${(x.job_sheet?.load_order ?? []).map((i) => `<tr><td>${esc(i.step)}</td><td>${esc(t(i.name_ar, i.name_en))}</td><td>${esc(i.quantity)}</td>
        <td>${i.heavy ? `<span class="tag">${t('ثقيل', 'heavy')}</span>` : ''}${i.dismantle ? `<span class="tag">${t('فك وتركيب', 'dismantle')}</span>` : ''}${i.fragile ? `<span class="tag fragile">${t('قابل للكسر', 'fragile')}</span>` : ''}</td></tr>`).join('')}</tbody></table>
    </div>
    ${planHtml(x.plan)}`;

  $('#detail').querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => setStage(b.dataset.stage, b)));
  $('#detail').querySelectorAll('[data-stars]').forEach((b) => b.addEventListener('click', () => rate(Number(b.dataset.stars))));
  $('#photo')?.addEventListener('change', (e) => { $('#photo-name').textContent = e.target.files[0]?.name ?? ''; });
  $('#chat-form').addEventListener('submit', sendChat);
  state.lastChat = '';
  renderChat();
}

async function setStage(stage, button) {
  const id = state.selected;
  const file = $('#photo')?.files?.[0];
  button.disabled = true;
  try {
    if (file) {
      // multipart: stage + idempotency key + the photo (same as the app)
      const form = new FormData();
      form.append('stage', stage); form.append('idempotency_key', key()); form.append('photo', file);
      const send = () => fetch(`/api/tech/tasks/${id}/status`, { method: 'POST', headers: { authorization: `Bearer ${store.access}` }, body: form });
      let r = await send();
      if (r.status === 401) { await api('GET', '/auth/me'); r = await send(); } // api() refreshes the token
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ApiError(r.status, d.error, d.message ?? `Error ${r.status}`); }
    } else {
      await api('POST', `/tech/tasks/${id}/status`, { stage, idempotency_key: key() });
    }
    toast(`${stageName(stage)} ✓`);
    await refreshAll(true);
    const now = state.tasks.find((x) => x.id === id);
    if (now && now.bucket !== state.scope) { state.scope = now.bucket; renderList(); }
    await loadTask(id);
  } catch (e) { toast(errorText(e), true); button.disabled = false; }
}

async function rate(stars) {
  try {
    await api('POST', `/tech/tasks/${state.selected}/rate-client`, { stars });
    toast(t('شكراً، تم تقييم العميل', 'Thanks, the customer is rated'));
    await loadTask(state.selected);
  } catch (e) { toast(errorText(e), true); }
}

function renderChat() {
  const log = $('#chat-log'); if (!log) return;
  const sig = JSON.stringify(state.messages.map((m) => m.id));
  if (sig === state.lastChat) return;
  state.lastChat = sig;
  log.innerHTML = state.messages.length ? state.messages.map((m) => `<div class="msg ${m.sender_id === state.me.id ? 'mine' : ''}">${esc(m.body)}
    <small>${esc(m.sender_name ?? m.sender_role)} · ${esc(dateTime(m.created_at))}</small></div>`).join('')
    : `<p class="muted">${t('لا توجد رسائل بعد.', 'No messages yet.')}</p>`;
  log.scrollTop = log.scrollHeight;
}

async function sendChat(ev) {
  ev.preventDefault();
  const input = $('#chat-input'); const body = input.value.trim(); if (!body) return;
  try {
    await api('POST', `/moves/${state.selected}/messages`, { body });
    input.value = '';
    await loadTask(state.selected, true);
  } catch (e) { toast(errorText(e), true); }
}

// ---------- boot
applyLang();
if (store.access) start().catch(() => signOut()); else { $('#login').hidden = false; }
