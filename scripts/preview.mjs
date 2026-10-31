// Локальный просмотр собранного сайта по тому же пути, что и на GitHub Pages: /katletkadesign/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIST_DIR, BASE_PATH } from './lib/paths.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.avif': 'image/avif', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

export function createPreviewServer(root = DIST_DIR) {
  const base = path.resolve(root) + path.sep;
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
    if (p === '/') { res.writeHead(302, { Location: BASE_PATH }).end(); return; }
    if (!p.startsWith(BASE_PATH)) { res.writeHead(404).end('Not found'); return; }
    let file = path.resolve(root, p.slice(BASE_PATH.length) || 'index.html');
    if (!file.startsWith(base) && file !== path.resolve(root)) { res.writeHead(403).end('Forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('Not found'); return; }
    const size = fs.statSync(file).size, type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) { console.error('Сначала соберите сайт: npm run build'); process.exit(1); }
  const port = Number(process.env.PORT) || 4173;
  createPreviewServer().listen(port, '127.0.0.1', () => console.log(`Сайт: http://127.0.0.1:${port}${BASE_PATH}`));
}
