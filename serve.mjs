// Server statico per provare l'app in locale: node serve.mjs
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = fileURLToPath(new URL('./docs/', import.meta.url));
const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json',
  '.js':'text/javascript', '.png':'image/png', '.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml', '.css':'text/css' };

createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Non trovato'); }
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat()
    .find(i => i && i.family === 'IPv4' && !i.internal);
  console.log(`App su:        http://localhost:${PORT}`);
  if (lan) console.log(`Dal telefono:  http://${lan.address}:${PORT}   (stessa rete Wi-Fi)`);
});
