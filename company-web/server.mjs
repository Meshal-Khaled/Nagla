// Naqla company portal: a local website for a moving company (accept / reject moves, assign a technician,
// follow the progress, chat with the customer).
//
//   node company-web/server.mjs            → http://localhost:4930
//   NAGLA_API=http://localhost:3000 node company-web/server.mjs   (a local API instead of the live one)
//
// It serves the pages in ./public and forwards /api/* to the Naqla API, so the browser only ever talks to
// localhost (no CORS setup on the API). No dependencies: Node 18+ (built-in fetch).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4930);
const API = (process.env.NAGLA_API ?? 'https://nagla.arc-homlab.com').replace(/\/$/, '');
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// request headers worth forwarding to the API (no cookies, no host)
const FORWARD = ['authorization', 'content-type', 'accept', 'accept-language'];

async function proxy(req, res) {
  const target = API + req.url.slice('/api'.length);
  const headers = {};
  for (const h of FORWARD) if (req.headers[h]) headers[h] = req.headers[h];
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const r = await fetch(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual' });
    const out = {};
    for (const h of ['content-type', 'cache-control', 'location']) { const v = r.headers.get(h); if (v) out[h] = v; }
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'network', message: `Can't reach the Naqla API at ${API}: ${e.message}` }));
  }
}

async function serveFile(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

createServer((req, res) => (req.url.startsWith('/api/') ? proxy(req, res) : serveFile(req, res)))
  .listen(PORT, '127.0.0.1', () => console.log(`Naqla company portal: http://localhost:${PORT}  (API: ${API})`));
