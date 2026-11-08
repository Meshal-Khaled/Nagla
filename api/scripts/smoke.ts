// End-to-end smoke test against running services (api + worker + ai with VISION_PROVIDER=fake):
//   npm run smoke
import sharp from 'sharp';
import { config } from '../src/config.js';

const BASE = process.env.SMOKE_URL ?? config.PUBLIC_URL;
let token = '';

async function call<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const h: Record<string, string> = { ...headers };
  if (token && !h['x-agent-token']) h.authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: payload });
  const data = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
  return data as T;
}
const step = (msg: string) => console.log(`✓ ${msg}`);

async function photo(color: string) {
  const buf = await sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(buf)], { type: 'image/jpeg' });
}

const email = `smoke-${Date.now()}@nagla.test`;
token = (await call('POST', '/auth/register', { name: 'Smoke', email, password: 'smoke-password' })).access_token;
step(`registered ${email}`);

const move = await call('POST', '/moves');
for (const [room, colors] of [['bedroom_1', ['#a0b0c0', '#b0a0c0']], ['living_room', ['#c0b0a0']]] as const) {
  const fd = new FormData();
  fd.set('room', room);
  for (const c of colors) fd.append('file', await photo(c), 'p.jpg');
  await call('POST', `/moves/${move.id}/photos`, fd);
}
step('uploaded photos for 2 rooms');

const job = await call('POST', `/moves/${move.id}/plan`);
let status = 'queued';
for (let i = 0; i < 60 && (status === 'queued' || status === 'running'); i++) {
  await new Promise((r) => setTimeout(r, 500));
  const j = await call('GET', `/jobs/${job.job_id}`);
  status = j.status;
  if (status === 'failed') throw new Error(`detection failed: ${j.error}`);
}
if (status !== 'done') throw new Error(`detection did not finish (status ${status}); is the worker running?`);
let details = await call('GET', `/moves/${move.id}`);
step(`detection done: ${details.items.map((i: any) => i.label).join(', ')}`);

const nightstands = details.items.filter((i: any) => i.category === 'bedside_table');
if (nightstands.length >= 2) {
  details = await call('POST', `/moves/${move.id}/items/merge`, { keep_id: nightstands[0].id, merge_ids: [nightstands[1].id] });
  step('merged duplicate bedside tables');
}
const [boxRow] = await call('GET', '/catalog?q=moving_box');
details = (await call('POST', `/moves/${move.id}/items`, { catalog_id: boxRow.id, quantity: 10 })).move;
step('added 10 moving boxes by hand');

await call('PATCH', `/moves/${move.id}`, {
  pickup_address: 'Al Olaya, Riyadh', pickup_floor: 2, pickup_has_elevator: false,
  dropoff_address: 'Al Malqa, Riyadh', dropoff_floor: 0, dropoff_has_elevator: true,
  date_from: '2026-12-10', preferred_time: '08:30',
});
const { offers } = await call('GET', `/moves/${move.id}/quotes`);
step(`offers: ${offers.map((o: any) => `${o.company_name} ${o.price_halalas / 100} SAR (${o.truck_name}×${o.trips})`).join(' | ')}`);

const saqr = offers.find((o: any) => o.company_name === 'Al-Saqr Movers') ?? offers[0];
await call('POST', `/moves/${move.id}/confirm`, { company_id: saqr.company_id });
step(`confirmed with ${saqr.company_name}`);

token = (await call('POST', '/auth/login', { email: 'admin@saqr.test', password: config.SEED_PASSWORD })).access_token;
const k = () => crypto.randomUUID();
await call('POST', `/moves/${move.id}/events`, { stage: 'accepted', idempotency_key: k() });
await call('POST', `/moves/${move.id}/events`, { stage: 'crew_assigned', idempotency_key: k() });
const { agent_link } = await call('POST', `/company/moves/${move.id}/agent-link`);
const agentToken = agent_link.split('/agent/')[1];
step('company accepted, assigned crew, issued agent link');

const page = await fetch(agent_link.replace(config.PUBLIC_URL, BASE));
if (!page.ok || !(await page.text()).includes('data-stage="on_the_way"')) throw new Error('agent page missing buttons');
for (const stage of ['on_the_way', 'arrived_pickup', 'loading', 'loaded', 'in_transit', 'arrived_destination', 'unloading', 'completed']) {
  const key = k();
  await call('POST', `/moves/${move.id}/events`, { stage, idempotency_key: key }, { 'x-agent-token': agentToken });
  if (stage === 'loaded') {
    const again = await call('POST', `/moves/${move.id}/events`, { stage, idempotency_key: key }, { 'x-agent-token': agentToken });
    if (again.result !== 'duplicate') throw new Error('double tap was not de-duplicated');
  }
}
step('agent ran on_the_way → completed (double tap ignored)');

const tracking = await call('GET', `/moves/${move.id}/tracking`);
if (tracking.progress?.percent !== 100) throw new Error(`progress ${JSON.stringify(tracking.progress)}`);
const expired = await fetch(agent_link.replace(config.PUBLIC_URL, BASE));
if (expired.status !== 404) throw new Error('agent link still works after completion');
step(`tracking 100% with ${tracking.events.length} events; agent link expired`);

const sheet = await call('GET', `/moves/${move.id}/job-sheet`);
step(`job sheet: ${sheet.totals.items} items, ${sheet.totals.volume_m3} m³, first to load: ${sheet.load_order[0].label}`);
console.log('\nSMOKE OK');
