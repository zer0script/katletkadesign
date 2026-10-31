// Локальный сервер редактора. Слушает только loopback; не входит в публичную сборку.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ContentStore, MAX_IMAGE_BYTES, MAX_JSON_BYTES } from './store.mjs';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SHARED_SCHEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'schema.js');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/editor.js': ['editor.js', 'text/javascript; charset=utf-8'],
  '/editor.css': ['editor.css', 'text/css; charset=utf-8'],
};
const IMG_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', jpeg: 'image/jpeg', avif: 'image/avif' };
const IMG_URL_RE = /^\/assets\/works\/([a-z0-9][a-z0-9._-]{0,100}\.(?:webp|jpe?g|png|avif))$/;
const SEC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function createEditorServer({ contentFile, assetsDir, port = 4174, token = crypto.randomBytes(24).toString('hex') }) {
  const store = new ContentStore({ contentFile, assetsDir });
  const state = { port };
  const allowedHosts = () => new Set([`127.0.0.1:${state.port}`, `localhost:${state.port}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${state.port}`, `http://localhost:${state.port}`]);

  const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(data), ...SEC_HEADERS, ...extra });
    res.end(data);
  };
  const fail = (res, status, message, extra) => send(res, status, { error: message, ...extra });

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > limit) return reject(Object.assign(new Error('тело запроса слишком большое'), { status: 413 }));
      const chunks = []; let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) { reject(Object.assign(new Error('тело запроса слишком большое'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  const tokenOk = (req) => {
    const t = String(req.headers['x-editor-token'] || '');
    const a = Buffer.from(t), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!allowedHosts().has(String(req.headers.host || '').toLowerCase())) return fail(res, 403, 'недопустимый Host');
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname, method = req.method;
      const isApi = p.startsWith('/api/');
      const origin = req.headers.origin;
      if (origin !== undefined && !allowedOrigins().has(origin)) return fail(res, 403, 'недопустимый Origin');
      if (method !== 'GET' && method !== 'HEAD') {
        if (origin === undefined) return fail(res, 403, 'нужен заголовок Origin');
        if (!isApi) return fail(res, 405, 'метод не поддерживается');
      }

      if (!isApi) {
        if (method !== 'GET') return fail(res, 405, 'метод не поддерживается');
        if (STATIC[p]) {
          let body = fs.readFileSync(path.join(PUBLIC_DIR, STATIC[p][0]));
          if (p === '/') body = Buffer.from(body.toString('utf8').replace('__EDITOR_TOKEN__', token));
          return send(res, 200, body, STATIC[p][1], p === '/' ? { 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } : {});
        }
        if (p === '/shared/schema.js') return send(res, 200, fs.readFileSync(SHARED_SCHEMA), 'text/javascript; charset=utf-8');
        const m = IMG_URL_RE.exec(p);
        if (m) {
          const abs = store.resolveImage(`assets/works/${m[1]}`);
          if (abs && fs.existsSync(abs)) return send(res, 200, fs.readFileSync(abs), IMG_TYPES[path.extname(abs).slice(1)] || 'application/octet-stream');
        }
        return fail(res, 404, 'не найдено');
      }

      if (!tokenOk(req)) return fail(res, 403, 'неверный токен редактора: перезагрузите страницу');

      if (p === '/api/content' && method === 'GET') return send(res, 200, { content: store.read() });
      if (p === '/api/content' && method === 'PUT') {
        if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'нужен application/json');
        let data;
        try { data = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8')); } catch (e) { return fail(res, e.status || 400, e.status ? e.message : 'некорректный JSON'); }
        const r = store.save(data);
        return r.ok ? send(res, 200, { ok: true, removed: r.removed }) : fail(res, 422, 'контент не прошёл проверку', { errors: r.errors });
      }
      if (p === '/api/images' && method === 'POST') {
        const buf = await readBody(req, MAX_IMAGE_BYTES);
        return send(res, 201, { path: store.saveImage(buf) });
      }
      return fail(res, 404, 'не найдено');
    } catch (e) {
      const status = e.status || 500;
      if (!res.headersSent) fail(res, status, status === 500 ? 'внутренняя ошибка' : e.message);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;

  return {
    server, token, store,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { state.port = server.address().port; resolve(state.port); });
    }),
    close: () => new Promise((r) => server.close(() => r())),
  };
}
