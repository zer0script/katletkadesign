import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createEditorServer } from '../editor/server/app.mjs';
import { copyContent, tinyWebp } from './helpers.mjs';

async function start() {
  const c = copyContent();
  const ed = createEditorServer({ ...c, port: 0 });
  const port = await ed.listen();
  const base = `http://127.0.0.1:${port}`;
  const call = (p, { method = 'GET', body, headers = {}, token = true, origin = true } = {}) => fetch(base + p, {
    method, body,
    headers: { ...(token ? { 'X-Editor-Token': ed.token } : {}), ...(origin && method !== 'GET' ? { Origin: base } : {}), ...headers },
  });
  return { ...c, ed, port, base, call };
}
const putJson = (t, obj, extra) => t.call('/api/content', { method: 'PUT', body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' }, ...extra });

test('читает контент и сохраняет правки работы и цены в файлы', async () => {
  const t = await start();
  try {
    const { content } = await (await t.call('/api/content')).json();
    content.sections[1].works[0].title = 'Новое название работы';
    content.price.items[1].price = 'от 999р';
    content.price.items[1].details = 'Новые подробности';
    const res = await putJson(t, content);
    assert.equal(res.status, 200);
    const onDisk = JSON.parse(fs.readFileSync(t.contentFile, 'utf8'));
    assert.equal(onDisk.sections[1].works[0].title, 'Новое название работы');
    assert.equal(onDisk.price.items[1].price, 'от 999р');
    assert.equal(onDisk.price.items[1].details, 'Новые подробности');
    assert.match(fs.readFileSync(t.contentFile, 'utf8'), /\n$/);
    assert.deepEqual(fs.readdirSync(path.dirname(t.contentFile)).filter((n) => n.endsWith('.tmp')), []);
  } finally { await t.ed.close(); }
});

test('создание, переименование, сортировка и удаление раздела сохраняются', async () => {
  const t = await start();
  try {
    const { content } = await (await t.call('/api/content')).json();
    const n = content.sections.length;
    content.sections.push({ name: 'Новая', description: '', works: [] });
    content.sections[0].name = 'Переименована';
    [content.sections[1], content.sections[2]] = [content.sections[2], content.sections[1]];
    const second = content.sections[1].name;
    content.sections.pop();
    content.sections.splice(3, 1);
    assert.equal((await putJson(t, content)).status, 200);
    const d = JSON.parse(fs.readFileSync(t.contentFile, 'utf8'));
    assert.equal(d.sections.length, n - 1);
    assert.equal(d.sections[0].name, 'Переименована');
    assert.equal(d.sections[1].name, second);
  } finally { await t.ed.close(); }
});

test('загрузка картинки: имя назначает сервер, формат проверяется по содержимому', async () => {
  const t = await start();
  try {
    const bad = await t.call('/api/images', { method: 'POST', body: Buffer.from('<svg onload=alert(1)>'), headers: { 'Content-Type': 'image/webp' } });
    assert.equal(bad.status, 415);
    const ok = await t.call('/api/images', { method: 'POST', body: tinyWebp(), headers: { 'Content-Type': 'image/webp' } });
    assert.equal(ok.status, 201);
    const { path: p } = await ok.json();
    assert.match(p, /^assets\/works\/[0-9a-f]{12}\.webp$/);
    assert.ok(fs.existsSync(path.join(t.assetsDir, p.replace('assets/', ''))));
    assert.equal((await t.call('/' + p)).status, 200);
    const { content } = await (await t.call('/api/content')).json();
    content.sections[0].works[0].image = p;
    assert.equal((await putJson(t, content)).status, 200);
  } finally { await t.ed.close(); }
});

test('неиспользуемые картинки удаляются при сохранении, используемые остаются', async () => {
  const t = await start();
  try {
    const { content } = await (await t.call('/api/content')).json();
    const gone = content.sections[0].works.pop();
    const res = await (await putJson(t, content)).json();
    assert.ok(res.removed.includes(gone.image));
    assert.equal(fs.existsSync(path.join(t.assetsDir, gone.image.replace('assets/', ''))), false);
    assert.equal(fs.existsSync(path.join(t.assetsDir, content.sections[0].works[0].image.replace('assets/', ''))), true);
  } finally { await t.ed.close(); }
});

test('невалидный контент не записывается', async () => {
  const t = await start();
  try {
    const before = fs.readFileSync(t.contentFile, 'utf8');
    const { content } = await (await t.call('/api/content')).json();
    for (const mutate of [(c) => { c.auth = { v: 1 }; }, (c) => { c.telegram = 'javascript:alert(1)'; }, (c) => { c.sections[0].works[0].image = '../../etc/passwd'; },
      (c) => { c.sections[0].works[0].image = 'assets/works/nope.webp'; }, (c) => { c.sections[0].name = ''; }]) {
      const c = structuredClone(content); mutate(c);
      assert.equal((await putJson(t, c)).status, 422);
    }
    assert.equal((await putJson(t, 'не объект')).status, 422);
    assert.equal(fs.readFileSync(t.contentFile, 'utf8'), before);
  } finally { await t.ed.close(); }
});

test('защита: токен, Origin, Host, типы и размеры', async () => {
  const t = await start();
  try {
    assert.equal((await t.call('/api/content', { token: false })).status, 403);
    assert.equal((await putJson(t, {}, { token: false })).status, 403);
    assert.equal((await putJson(t, {}, { origin: false })).status, 403);
    assert.equal((await putJson(t, {}, { headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' } })).status, 403);
    assert.equal((await t.call('/api/content', { method: 'PUT', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await t.call('/api/content', { method: 'PUT', body: 'x'.repeat(1024 * 1024 + 10), headers: { 'Content-Type': 'application/json' } })).status, 413);
    assert.equal((await t.call('/api/images', { method: 'POST', body: Buffer.alloc(8 * 1024 * 1024 + 10, 1), headers: { 'Content-Type': 'image/webp' } })).status, 413);
    const status = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: t.port, path: '/', headers: { Host: 'evil.example' } }, (r) => { r.resume(); resolve(r.statusCode); });
    });
    assert.equal(status, 403);
    assert.equal(t.ed.server.address().address, '127.0.0.1');
  } finally { await t.ed.close(); }
});

test('нельзя читать файлы вне assets/works и обходить пути', async () => {
  const t = await start();
  try {
    for (const p of ['/assets/works/../../content.json', '/assets/works/..%2f..%2fcontent.json', '/content/content.json', '/scripts/build.mjs', '/editor/server/store.mjs', '/%2e%2e/package.json', '/shared/../package.json']) {
      assert.equal((await t.call(p)).status, 404, p);
    }
    assert.equal((await t.call('/shared/schema.js')).status, 200);
    const html = await (await t.call('/')).text();
    assert.match(html, /name="editor-token" content="[0-9a-f]{48}"/);
  } finally { await t.ed.close(); }
});
