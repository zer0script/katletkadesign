import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONTENT_FILE } from '../scripts/lib/paths.mjs';
import { validateContent, normalizeContent, isImagePath, isTelegramUrl, escapeHtml } from '../shared/schema.js';

const real = () => JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

test('реальный контент проходит проверку и содержит всё нужное', () => {
  const c = real();
  assert.deepEqual(validateContent(c), []);
  assert.equal(c.sections.length, 6);
  assert.equal(c.sections.reduce((n, s) => n + s.works.length, 0), 26);
  assert.equal(c.price.items.length, 6);
  assert.equal(c.telegram, 'https://t.me/katletkadev');
});

test('auth и другие служебные поля запрещены', () => {
  for (const k of ['auth', 'rev', 'token', 'password']) {
    const c = real(); c[k] = 'x';
    assert.ok(validateContent(c).some((e) => e.includes(k)), k);
  }
  const c = real(); c.price.items[0].hash = 'x';
  assert.ok(validateContent(c).length > 0);
});

test('картинки: только локальные пути assets/works', () => {
  for (const bad of ['data:image/webp;base64,AAAA', 'https://evil.example/x.webp', '../x.webp', 'assets/works/../../x.webp', '/assets/works/x.webp', 'assets/works/x.svg', 'javascript:alert(1)']) {
    assert.equal(isImagePath(bad), false, bad);
  }
  assert.equal(isImagePath('assets/works/01-01-abcdef12.webp'), true);
});

test('Telegram: только https://t.me', () => {
  assert.equal(isTelegramUrl('https://t.me/katletkadev'), true);
  for (const bad of ['http://t.me/x', 'javascript:alert(1)', 'https://t.me.evil.com/x', 'https://evil.com/t.me/']) assert.equal(isTelegramUrl(bad), false, bad);
});

test('валидация находит ошибки типов и длины', () => {
  const c = real(); c.sections[0].name = ''; c.hero = 5; c.price.items[0].details = 'я'.repeat(3001); c.sections[0].works[0].image = 'x';
  const e = validateContent(c).join('\n');
  for (const part of ['name', 'hero', 'details', 'image']) assert.match(e, new RegExp(part));
});

test('normalizeContent не бросает на мусоре и отбрасывает лишнее', () => {
  for (const junk of [null, 5, 'x', [], { sections: 5 }, { sections: [null, { works: [1] }] }]) assert.doesNotThrow(() => normalizeContent(junk));
  const n = normalizeContent({ ...real(), auth: { v: 1 }, telegram: 'javascript:1' });
  assert.equal('auth' in n, false);
  assert.equal(n.telegram, '');
});

test('escapeHtml экранирует разметку', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});
