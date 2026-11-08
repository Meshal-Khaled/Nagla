import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../../deps.js';
import { loadJobSheet } from '../jobSheet/service.js';
import { AGENT_STAGES, nextStagesFor, progress, type Stage } from './stages.js';
import { findMoveByAgentToken, trackingView } from './service.js';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nice = (s: string) => s.replace(/_/g, ' ');

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{--bg:#f6f7f9;--card:#fff;--ink:#1d2330;--muted:#667085;--accent:#0f766e;--line:#e4e7ec}
  @media (prefers-color-scheme:dark){:root{--bg:#12151b;--card:#1b2029;--ink:#e6e9ef;--muted:#98a2b3;--accent:#2dd4bf;--line:#2b3240}}
  body{margin:0;font:16px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
  main{max-width:640px;margin:0 auto;padding:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
  h1{font-size:20px;margin:8px 0} h2{font-size:16px;margin:0 0 8px} .muted{color:var(--muted)}
  .bar{height:10px;background:var(--line);border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
  button{width:100%;padding:14px;margin:6px 0;font-size:16px;border-radius:10px;border:1px solid var(--accent);background:transparent;color:var(--ink);cursor:pointer}
  button.next{background:var(--accent);color:#fff;font-weight:600} button:disabled{opacity:.5}
  table{width:100%;border-collapse:collapse;font-size:14px} td{padding:4px 2px;border-bottom:1px solid var(--line)}
  .tag{font-size:12px;padding:1px 6px;border-radius:6px;border:1px solid var(--line);margin-left:4px}
  #msg{min-height:1.4em}
</style></head><body><main>${body}</main></body></html>`;

/** Crew web page opened from the agent token link: one button per allowed next stage. */
export async function agentPageRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/agent/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.params);
    reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');

    const move = await findMoveByAgentToken(deps.db, token);
    if (!move) return reply.code(404).send(page('Link expired', '<h1>This link is invalid or has expired.</h1>'));

    const tracking = await trackingView(deps, move.id);
    const sheet = await loadJobSheet(deps.db, deps.catalog, move.id);
    const current = move.current_stage as Stage;
    const next = nextStagesFor('agent', current).filter((s) => AGENT_STAGES.includes(s));
    const pct = progress(current)?.percent ?? 0;

    const buttons = next.length
      ? next.map((s, i) => `<button class="${i === 0 ? 'next' : ''}" data-stage="${esc(s)}">${esc(nice(s))}</button>`).join('')
      : `<p class="muted">${current === 'confirmed' ? 'Waiting for the company to accept this move.' : 'No further updates.'}</p>`;

    const rows = sheet.load_order.map((i) => `<tr><td>${i.step}</td><td>${esc(i.label)} <span class="muted">${esc(i.name_en)}</span>
      ${i.quantity > 1 ? `×${i.quantity}` : ''}${i.dismantle ? '<span class="tag">dismantle</span>' : ''}${i.heavy ? '<span class="tag">heavy</span>' : ''}${i.fragile ? '<span class="tag">fragile</span>' : ''}</td></tr>`).join('');

    return page('Nagla crew', `
      <h1>Move ${esc(move.id.slice(0, 8))}</h1>
      <div class="card">
        <div><b>From</b> ${esc(move.pickup_address)} <span class="muted">floor ${esc(move.pickup_floor ?? '-')}${move.pickup_has_elevator ? ', elevator' : ''}</span></div>
        <div><b>To</b> ${esc(move.dropoff_address)} <span class="muted">floor ${esc(move.dropoff_floor ?? '-')}${move.dropoff_has_elevator ? ', elevator' : ''}</span></div>
        <div class="muted">${esc(move.date_from)}${move.date_to && move.date_to !== move.date_from ? ` – ${esc(move.date_to)}` : ''} ${esc(move.preferred_time ?? '')}</div>
        ${move.notes ? `<p>${esc(move.notes)}</p>` : ''}
      </div>
      <div class="card">
        <h2>Now: ${esc(nice(current))}</h2>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="card">
        <label class="muted">Photo (optional) <input type="file" id="photo" accept="image/*" capture="environment"></label>
        ${buttons}
        <div id="msg" class="muted"></div>
      </div>
      <div class="card"><h2>Load order</h2><table>${rows}</table>
        <p class="muted">${sheet.totals.items} items · ${sheet.totals.volume_m3} m³ · ${sheet.totals.weight_kg} kg · dismantle ${sheet.totals.dismantle_minutes} min</p></div>
      <div class="card"><h2>Timeline</h2>${tracking.events.map((e) =>
        `<div>${esc(nice(e.stage))}${e.skipped ? ' <span class="muted">(skipped)</span>' : ''} <span class="muted">${esc(new Date(e.created_at).toLocaleString())}</span></div>`).join('')}</div>
      <script>
        const moveId = ${JSON.stringify(move.id)};
        const token = ${JSON.stringify(token)};
        // one key per button per page load: a double tap sends the same key and is ignored
        const keys = {};
        document.querySelectorAll('button[data-stage]').forEach((b) => {
          keys[b.dataset.stage] = crypto.randomUUID();
          b.addEventListener('click', async () => {
            document.querySelectorAll('button').forEach((x) => (x.disabled = true));
            const msg = document.getElementById('msg');
            msg.textContent = 'Sending…';
            const fd = new FormData();
            fd.set('stage', b.dataset.stage);
            fd.set('idempotency_key', keys[b.dataset.stage]);
            const f = document.getElementById('photo').files[0];
            if (f) fd.set('photo', f);
            try {
              const r = await fetch('/moves/' + moveId + '/events', { method: 'POST', headers: { 'x-agent-token': token }, body: fd });
              const j = await r.json();
              if (!r.ok) throw new Error(j.message || r.status);
              location.reload();
            } catch (e) {
              msg.textContent = 'Failed: ' + e.message;
              document.querySelectorAll('button').forEach((x) => (x.disabled = false));
            }
          });
        });
      </script>`);
  });
}
