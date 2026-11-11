// Naqla company portal: the company admin's page (accept / reject, assign a technician, follow the progress, chat).
'use strict';

window.onLangChange = () => { if (state.me) { renderList(); renderDetail(); } };

// ---------- state
const state = { me: null, scope: 'incoming', lists: { incoming: [], active: [], closed: [] }, selected: null, detail: null, agents: [], seen: new Set(), lastChat: '' };

// ---------- sign in / out
$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const err = $('#login-error'); err.hidden = true;
  const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    const res = await raw('POST', '/auth/login', { email: String(f.get('email')).trim(), password: f.get('password') }, false);
    if (res.status !== 200) throw new ApiError(res.status, res.data?.error, res.data?.message ?? t('بيانات الدخول غير صحيحة.', 'Wrong email or password.'));
    store.access = res.data.access_token; store.refresh = res.data.refresh_token;
    await start();
  } catch (e) {
    err.textContent = e.status === 401 ? t('البريد أو كلمة المرور غير صحيحة.', 'Wrong email or password.') : errorText(e);
    err.hidden = false;
  } finally { btn.disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  if (store.refresh) raw('POST', '/auth/logout', { refresh_token: store.refresh }, false).catch(() => {});
  signOut();
});
function signOut(message) {
  store.access = null; store.refresh = null; state.me = null; state.selected = null; state.detail = null;
  clearInterval(start.timer);
  $('#app').hidden = true; $('#login').hidden = false;
  if (message) { $('#login-error').textContent = message; $('#login-error').hidden = false; }
}

async function start() {
  const me = await api('GET', '/auth/me');
  if (me.role === 'agent') { location.href = 'tech.html'; return; } // technicians have their own page
  if (me.role !== 'company_admin') {
    signOut(t('هذه البوابة لمديري الشركات وفنييها فقط.', 'This portal is for company admins and technicians only.'));
    return;
  }
  state.me = me;
  $('#company-name').textContent = me.company_name ?? '';
  $('#admin-name').textContent = `${me.name} · ${me.email}`;
  $('#login').hidden = true; $('#app').hidden = false;
  state.agents = await api('GET', '/company/agents').catch(() => []);
  await refreshAll();
  clearInterval(start.timer);
  start.timer = setInterval(() => refreshAll(true), 8000); // live: new requests and the technician's progress
}

// ---------- list
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { state.scope = b.dataset.scope; renderList(); }));

async function refreshAll(quiet = false) {
  try {
    const [incoming, active, closed] = await Promise.all(['incoming', 'active', 'closed'].map((s) => api('GET', `/company/moves?scope=${s}`)));
    const fresh = incoming.filter((m) => !state.seen.has(m.id));
    if (quiet && fresh.length && state.seen.size) toast(t(`طلب جديد #${fresh[0].move_no}`, `New move #${fresh[0].move_no}`));
    incoming.forEach((m) => state.seen.add(m.id));
    state.lists = { incoming, active, closed };
    $('.live').classList.remove('off');
    renderList();
    if (state.selected) await loadDetail(state.selected, true);
  } catch (e) {
    $('.live').classList.add('off');
    if (!quiet) toast(errorText(e), true);
  }
}

function renderList() {
  for (const s of ['incoming', 'active', 'closed']) $(`#count-${s}`).textContent = state.lists[s].length;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scope === state.scope)));
  const list = state.lists[state.scope];
  if (!list.length) {
    $('#list').innerHTML = `<div class="empty">${esc({
      incoming: t('لا توجد طلبات بانتظاركم الآن.', 'No moves waiting for you right now.'),
      active: t('لا توجد طلبات قيد التنفيذ.', 'No moves in progress.'),
      closed: t('لا توجد طلبات منتهية بعد.', 'No closed moves yet.'),
    }[state.scope])}</div>`;
    return;
  }
  $('#list').innerHTML = list.map((m) => `
    <button class="move-card ${m.id === state.selected ? 'selected' : ''}" data-id="${esc(m.id)}">
      <div class="row"><span class="move-no">#${esc(m.move_no)}</span>${badge(m.current_stage)}<span class="price">${esc(sar(m.price_halalas))}</span></div>
      <div class="row"><strong>${esc(m.customer_name)}</strong><span class="muted">· ${esc(date(m.date_from))}${m.preferred_time ? ' · ' + esc(time12(m.preferred_time)) : ''}</span></div>
      <div class="addr">⬤ ${esc(m.pickup_address)}</div>
      <div class="addr">◯ ${esc(m.dropoff_address)}</div>
      <div class="row muted" style="font-size:13px">${m.volume_m3 != null ? esc(Number(m.volume_m3).toFixed(1)) + ' m³ · ' : ''}${esc(truck(m.truck_name))}${m.trips > 1 ? ' × ' + esc(m.trips) : ''}${m.assigned_agent_name ? ' · ' + esc(m.assigned_agent_name) : ''}</div>
      <div class="bar"><span style="width:${Number(m.progress?.percent ?? 0)}%"></span></div>
    </button>`).join('');
  document.querySelectorAll('.move-card').forEach((c) => c.addEventListener('click', () => select(c.dataset.id)));
}

// ---------- detail
async function select(id) {
  state.selected = id; state.lastChat = '';
  renderList();
  $('#detail').innerHTML = `<div class="empty">${t('جارٍ التحميل…', 'Loading…')}</div>`;
  await loadDetail(id);
}

async function loadDetail(id, quiet = false) {
  try {
    const [move, tracking, sheet, messages] = await Promise.all([
      api('GET', `/moves/${id}`), api('GET', `/moves/${id}/tracking`),
      api('GET', `/moves/${id}/job-sheet`).catch(() => null), api('GET', `/moves/${id}/messages`).catch(() => []),
    ]);
    if (state.selected !== id) return;
    const before = state.detail;
    state.detail = { move, tracking, sheet, messages };
    // a quiet refresh only redraws when something changed, so typing in the chat is never interrupted
    if (!quiet || !before || JSON.stringify(before.tracking) !== JSON.stringify(tracking) || before.move.assigned_agent_id !== move.assigned_agent_id) renderDetail();
    else renderChat();
  } catch (e) {
    if (!quiet) $('#detail').innerHTML = `<div class="card"><p class="error">${esc(errorText(e))}</p></div>`;
  }
}

function ring(percent) {
  const r = 38, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, percent)) / 100;
  return `<svg class="ring" viewBox="0 0 88 88" aria-hidden="true">
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="#EEF4F0" stroke-width="9"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="#0F6E66" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c * p} ${c}" transform="rotate(-90 44 44)"/>
    <text x="44" y="50" text-anchor="middle" font-size="18" font-weight="700" fill="#102B36">${Math.round(percent)}%</text></svg>`;
}

function renderDetail() {
  const d = state.detail; if (!d) return;
  const { move: m, tracking: tr, sheet } = d;
  const stage = tr.current_stage;
  const q = m.quote;
  const done = new Map(); const skipped = new Set();
  // each event is one stage; a stage jumped over is logged as its own event with skipped = true
  for (const e of tr.events) { done.set(e.stage, e); if (e.skipped === true) skipped.add(e.stage); }
  const idx = tr.stages.indexOf(stage);
  const keep = m.items.filter((i) => i.disposition === 'keep');

  // what the company can do now
  let actions = '';
  if (stage === 'confirmed') {
    actions = `<div class="actions">
      <button class="btn primary" data-act="accept">✓ ${t('قبول الطلب', 'Accept the move')}</button>
      <button class="btn danger" data-act="reject">${t('رفض', 'Reject')}</button></div>
      <p class="note">${t('بعد القبول عيّن فنياً لتنفيذ النقل. الفني يحدّث المراحل من تطبيقه وتظهر هنا مباشرة.', 'After accepting, assign a technician. The technician updates the stages from the app and you see them here live.')}</p>`;
  } else if (stage === 'accepted' || stage === 'crew_assigned') {
    const opts = state.agents.map((a) => `<option value="${esc(a.id)}" ${a.id === m.assigned_agent_id ? 'selected' : ''}>${esc(a.name)} (${esc(a.email)})</option>`).join('');
    actions = state.agents.length ? `<div class="actions">
      <select id="agent">${m.assigned_agent_id ? '' : `<option value="">${t('اختر الفني…', 'Choose a technician…')}</option>`}${opts}</select>
      <button class="btn primary" data-act="assign">${m.assigned_agent_id ? t('تغيير الفني', 'Change technician') : t('تعيين الفني', 'Assign technician')}</button>
      <button class="btn danger" data-act="cancel">${t('إلغاء الطلب', 'Cancel the move')}</button></div>`
      : `<p class="note">${t('لا يوجد فنيون في شركتكم بعد.', 'Your company has no technicians yet.')}</p>`;
    if (stage === 'crew_assigned') actions += `<p class="note">${t('بانتظار انطلاق الفني. المراحل التالية يحدّثها الفني من تطبيقه.', 'Waiting for the technician to set off. The next stages come from the technician app.')}</p>`;
  } else if (!['completed', 'rejected', 'cancelled'].includes(stage)) {
    actions = `<p class="note">${t('النقل جارٍ: يحدّث الفني المراحل من تطبيقه وتظهر هنا تلقائياً.', 'The move is under way: the technician updates the stages and they appear here automatically.')}</p>`;
  }

  const timeline = tr.stages.map((s, i) => {
    const ev = done.get(s);
    const cls = stage === 'completed' || i < idx ? 'done' : i === idx ? 'now' : 'todo';
    return `<li class="${cls}"><span class="dot">${cls === 'done' ? '✓' : ''}</span>
      <span><span class="label">${esc(stageName(s))}</span>${skipped.has(s) ? ` <span class="skipped">(${t('تم تخطيها', 'skipped')})</span>` : ''}
      ${ev?.photo_url ? ` · <a href="/api${esc(ev.photo_url)}" target="_blank" rel="noopener">${t('صورة', 'photo')}</a>` : ''}</span>
      <time>${ev ? esc(dateTime(ev.created_at)) : ''}</time></li>`;
  }).join('') + (['rejected', 'cancelled'].includes(stage) ? `<li class="now"><span class="dot">✕</span><span class="label">${esc(stageName(stage))}</span><time>${esc(dateTime(done.get(stage)?.created_at))}</time></li>` : '');

  const addr = (label, a, floor, lift, det) => `<dt>${label}</dt><dd>${esc(a ?? '—')}${det?.district ? ' · ' + esc(det.district) : ''}${det?.short_code ? ' · ' + esc(det.short_code) : ''}<br>
    <span class="muted">${t('الطابق', 'Floor')} ${esc(floor ?? 0)} · ${lift ? t('يوجد مصعد', 'elevator') : t('بدون مصعد', 'no elevator')}</span></dd>`;

  $('#detail').innerHTML = `
    <div class="card">
      <div class="head"><h2>#${esc(m.move_no)}</h2>${badge(stage)}<span class="muted" style="margin-inline-start:auto">${t('العميل', 'Customer')}: <strong>${esc(m.customer?.name ?? '')}</strong></span></div>
      <div class="facts">
        <div class="fact"><b>${esc(sar(q?.price_halalas))}</b><span>${t('السعر المثبّت', 'Locked price')}</span></div>
        <div class="fact"><b>${q ? esc(Number(q.volume_m3).toFixed(1)) + ' m³' : '—'}</b><span>${t('الحجم بعد التغليف', 'Packed volume')}</span></div>
        <div class="fact"><b>${esc(truck(q?.truck_name))}${q?.trips > 1 ? ' × ' + esc(q.trips) : ''}</b><span>${t('الشاحنة', 'Truck')}${q?.truck_capacity_m3 ? ' · ' + esc(q.truck_capacity_m3) + ' m³' : ''}</span></div>
        <div class="fact"><b>${esc(q?.crew_size ?? '—')}</b><span>${t('العمال', 'Crew')} · ~${esc(q?.estimated_minutes ?? '—')} ${t('دقيقة', 'min')}</span></div>
      </div>
      ${actions}
    </div>
    <div class="two">
      <div class="card">
        <h3>${t('التقدم', 'Progress')}</h3>
        <div class="ring-row">${ring(tr.progress?.percent ?? 0)}<div><strong>${esc(stageName(stage))}</strong><br>
          <span class="muted">${m.technician ? t('الفني: ', 'Technician: ') + esc(m.technician.name) : t('لم يُعيَّن فني بعد', 'No technician yet')}</span></div></div>
        <ol class="timeline">${timeline}</ol>
      </div>
      <div class="card">
        <h3>${t('تفاصيل النقل', 'Move details')}</h3>
        <dl class="kv">
          <dt>${t('الموعد', 'Date')}</dt><dd>${esc(date(m.date_from))}${m.date_to && m.date_to !== m.date_from ? ' – ' + esc(date(m.date_to)) : ''}${m.preferred_time ? ' · ' + esc(time12(m.preferred_time)) : ''}</dd>
          ${addr(t('من', 'From'), m.pickup_address, m.pickup_floor, m.pickup_has_elevator, m.pickup_details)}
          ${addr(t('إلى', 'To'), m.dropoff_address, m.dropoff_floor, m.dropoff_has_elevator, m.dropoff_details)}
          ${m.notes ? `<dt>${t('ملاحظات', 'Notes')}</dt><dd>${esc(m.notes)}</dd>` : ''}
        </dl>
        <h3>${t('المحادثة مع العميل', 'Chat with the customer')}</h3>
        <div class="chat-log" id="chat-log"></div>
        <form class="chat-form" id="chat-form"><input id="chat-input" maxlength="2000" placeholder="${t('اكتب رسالة…', 'Write a message…')}" autocomplete="off"><button class="btn primary">${t('إرسال', 'Send')}</button></form>
      </div>
    </div>
    <div class="card">
      <h3>${t('الأغراض للنقل', 'Items to move')} · ${keep.length}</h3>
      <table><thead><tr><th>#</th><th>${t('القطعة', 'Item')}</th><th>${t('الكمية', 'Qty')}</th><th>${t('الحجم', 'Volume')}</th><th>${t('الوزن', 'Weight')}</th></tr></thead>
      <tbody>${keep.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(t(i.name_ar, i.name_en))}${i.fragile ? `<span class="tag fragile">${t('قابل للكسر', 'fragile')}</span>` : ''}${i.dismantle_minutes ? `<span class="tag">${t('فك وتركيب', 'dismantle')}</span>` : ''}</td>
        <td>${esc(i.quantity)}</td><td>${esc((i.volume_m3 * i.quantity).toFixed(2))} m³</td><td>${esc(Math.round(i.weight_kg * i.quantity))} ${t('كغ', 'kg')}</td></tr>`).join('')}</tbody></table>
      ${sheet?.load_order?.length ? `<p class="note">${t('ترتيب التحميل: ', 'Load order: ')}${sheet.load_order.slice(0, 12).map((x) => esc(t(x.name_ar, x.name_en))).join(' ← ')}${sheet.load_order.length > 12 ? ' …' : ''}</p>` : ''}
      ${m.photos?.length ? `<h3>${t('صور العميل', "Customer's photos")}</h3><div class="photos">${m.photos.map((p) => `<a href="/api${esc(p.url)}" target="_blank" rel="noopener"><img src="/api${esc(p.url)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
    </div>
    ${planHtml(m.plan)}`;

  $('#detail').querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, b)));
  $('#chat-form').addEventListener('submit', sendChat);
  state.lastChat = '';
  renderChat();
}

function renderChat() {
  const d = state.detail; const log = $('#chat-log'); if (!d || !log) return;
  const sig = JSON.stringify(d.messages.map((x) => x.id));
  if (sig === state.lastChat) return;
  state.lastChat = sig;
  log.innerHTML = d.messages.length ? d.messages.map((x) => `<div class="msg ${x.sender_id === state.me.id ? 'mine' : ''}">${esc(x.body)}
    <small>${esc(x.sender_name ?? x.sender_role)} · ${esc(dateTime(x.created_at))}</small></div>`).join('')
    : `<p class="muted">${t('لا توجد رسائل بعد.', 'No messages yet.')}</p>`;
  log.scrollTop = log.scrollHeight;
}

async function sendChat(ev) {
  ev.preventDefault();
  const input = $('#chat-input'); const body = input.value.trim(); if (!body) return;
  try {
    await api('POST', `/moves/${state.selected}/messages`, { body });
    input.value = '';
    await loadDetail(state.selected, true);
  } catch (e) { toast(errorText(e), true); }
}

async function act(what, button) {
  const id = state.selected; const m = state.detail.move;
  try {
    if (what === 'accept') {
      await api('POST', `/moves/${id}/events`, { stage: 'accepted', idempotency_key: key() });
      toast(t(`تم قبول الطلب #${m.move_no}`, `Move #${m.move_no} accepted`));
    } else if (what === 'reject') {
      if (!confirm(t('رفض هذا الطلب؟ سيُبلَّغ العميل.', 'Reject this move? The customer is told.'))) return;
      await api('POST', `/moves/${id}/events`, { stage: 'rejected', idempotency_key: key() });
      toast(t('تم رفض الطلب', 'Move rejected'));
    } else if (what === 'assign') {
      const agent = $('#agent').value;
      if (!agent) return toast(t('اختر الفني أولاً.', 'Choose a technician first.'), true);
      await api('POST', `/company/moves/${id}/assign`, { agent_id: agent });
      toast(t('تم تعيين الفني', 'Technician assigned'));
    } else if (what === 'cancel') {
      if (!confirm(t('إلغاء هذا الطلب؟', 'Cancel this move?'))) return;
      await api('POST', `/moves/${id}/cancel`, { idempotency_key: key() });
      toast(t('تم إلغاء الطلب', 'Move cancelled'));
    }
    button.disabled = true;
    await refreshAll(true);
    // follow the move to the tab it is now in
    for (const s of ['incoming', 'active', 'closed']) if (state.lists[s].some((x) => x.id === id)) { state.scope = s; renderList(); }
  } catch (e) { toast(errorText(e), true); }
}

// ---------- boot
applyLang();
if (store.access) start().catch(() => signOut()); else { $('#login').hidden = false; }
