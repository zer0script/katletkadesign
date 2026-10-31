import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, inlineJson } from '../scripts/build.mjs';
import { checkDist } from '../scripts/check-dist.mjs';
import { walkModules } from '../scripts/lib/graph.mjs';
import { PUBLIC_ENTRY, ROOT, rel } from '../scripts/lib/paths.mjs';
import { copyContent, tmpDir } from './helpers.mjs';

const build = () => { const d = tmpDir('pf-dist-'); buildSite({ outDir: d, quiet: true }); return d; };

test('граф публичной точки входа не содержит редактор, скрипты и node-модули', () => {
  const { files, problems } = walkModules(PUBLIC_ENTRY);
  assert.deepEqual(problems, []);
  for (const f of files) assert.match(rel(f), /^(site|shared)\//);
  assert.ok(![...files].some((f) => /editor|scripts|server/.test(rel(f))));
});

test('чистая сборка проходит проверку и использует относительные пути', () => {
  const d = build();
  assert.deepEqual(checkDist(d), []);
  const html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)="\//);
  assert.match(html, /src="js\/site\/main\.js"/);
  assert.equal(fs.existsSync(path.join(d, 'editor')), false);
});

test('проверка сборки ловит редактор, source map, auth и битые ссылки', () => {
  const cases = {
    'editor-dir': (d) => { fs.mkdirSync(path.join(d, 'editor')); fs.writeFileSync(path.join(d, 'editor', 'editor.js'), 'x'); },
    'source map': (d) => fs.writeFileSync(path.join(d, 'js', 'site', 'main.js.map'), '{}'),
    'setEdit в js': (d) => fs.appendFileSync(path.join(d, 'js', 'site', 'main.js'), '\nfunction setEdit(){}'),
    'лишний js вне графа': (d) => fs.writeFileSync(path.join(d, 'js', 'admin.js'), 'export const a=1'),
    'импорт редактора': (d) => fs.appendFileSync(path.join(d, 'js', 'site', 'main.js'), "\nimport '../../editor.js';"),
    'auth в данных': (d) => { const f = path.join(d, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"version":1', '"auth":{"v":"a"},"version":1')); },
    'форма в html': (d) => { const f = path.join(d, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</body>', '<form id="d-form"></form></body>')); },
    'нет картинки': (d) => fs.rmSync(path.join(d, 'assets', 'works', fs.readdirSync(path.join(d, 'assets', 'works'))[0])),
    'абсолютный путь': (d) => { const f = path.join(d, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('href="site.css"', 'href="/site.css"')); },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const d = build(); mutate(d);
    assert.ok(checkDist(d).length > 0, `проверка пропустила: ${name}`);
  }
});

test('сборка отказывается собирать невалидный контент и отсутствующие картинки', () => {
  const c = copyContent(); const data = JSON.parse(fs.readFileSync(c.contentFile, 'utf8'));
  data.auth = { s: 'x' }; fs.writeFileSync(c.contentFile, JSON.stringify(data));
  assert.throws(() => buildSite({ outDir: tmpDir(), contentFile: c.contentFile, assetsDir: c.assetsDir, quiet: true }), /auth/);
  delete data.auth; data.sections[0].works[0].image = 'assets/works/missing.webp'; fs.writeFileSync(c.contentFile, JSON.stringify(data));
  assert.throws(() => buildSite({ outDir: tmpDir(), contentFile: c.contentFile, assetsDir: c.assetsDir, quiet: true }), /не найден/);
});

test('в сборку попадают только картинки, на которые ссылается контент', () => {
  const c = copyContent(); fs.writeFileSync(path.join(c.assetsDir, 'works', 'orphan.webp'), 'x');
  const d = tmpDir(); buildSite({ outDir: d, contentFile: c.contentFile, assetsDir: c.assetsDir, quiet: true });
  assert.equal(fs.existsSync(path.join(d, 'assets', 'works', 'orphan.webp')), false);
});

test('inlineJson не позволяет закрыть script-тег', () => {
  const evil = '</script><script>alert(1)</script>' + String.fromCharCode(0x2028);
  const s = inlineJson({ a: evil });
  assert.doesNotMatch(s, new RegExp('[<>' + String.fromCharCode(0x2028) + ']'));
  assert.equal(JSON.parse(s).a, evil);
});

test('опубликованный контент не зависит от локального хранилища браузера', () => {
  const src = fs.readFileSync(path.join(ROOT, 'site', 'main.js'), 'utf8');
  assert.doesNotMatch(src, /indexedDB|localStorage|sessionStorage/);
});
