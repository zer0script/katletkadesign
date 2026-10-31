// Публичная сборка: собирает в dist/ только то, что нужно посетителю.
// Редактор, локальный сервер, скрипты и исходники в dist не попадают: в сборку идут
// лишь модули, достижимые из site/main.js (обход графа импортов).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SITE_DIR, DIST_DIR, ASSETS_DIR, CONTENT_FILE, PUBLIC_ENTRY, rel } from './lib/paths.mjs';
import { readContent, checkContent } from './lib/content.mjs';
import { walkModules } from './lib/graph.mjs';
import { collectImagePaths, normalizeContent } from '../shared/schema.js';

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self'",
  "media-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*(?=\n)/g, '');
const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*(?=\n)/g, '');
const stripJs = (s) => s
  .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\n/gm, '')
  .replace(/^[ \t]*\/\/[^\n]*\n/gm, '');

// JSON внутри <script>: экранируем всё, что может закрыть тег или сломать разбор.
export const inlineJson = (obj) => JSON.stringify(obj)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

export function buildSite({ outDir = DIST_DIR, contentFile = CONTENT_FILE, assetsDir = ASSETS_DIR, quiet = false } = {}) {
  const log = (m) => { if (!quiet) console.log(m); };
  const content = readContent(contentFile);
  const errors = checkContent(content, assetsDir);
  if (errors.length) throw new Error('Контент не прошёл проверку:\n' + errors.map((e) => '  - ' + e).join('\n'));

  const { files, problems } = walkModules(PUBLIC_ENTRY);
  if (problems.length) throw new Error('Проблемы в графе модулей публичного сайта:\n' + problems.map((p) => '  - ' + p).join('\n'));
  for (const f of files) {
    const r = rel(f);
    if (!(r.startsWith('site/') || r.startsWith('shared/'))) throw new Error(`Публичная точка входа тянет недопустимый файл: ${r}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(outDir, 'js', rel(f))), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'js', rel(f)), stripJs(fs.readFileSync(f, 'utf8')));
  }

  const tpl = fs.readFileSync(path.join(SITE_DIR, 'index.template.html'), 'utf8');
  const html = stripHtml(tpl).replace('__CSP__', CSP).replace('__CONTENT_JSON__', () => inlineJson(normalizeContent(content)));
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  fs.writeFileSync(path.join(outDir, 'site.css'), stripCss(fs.readFileSync(path.join(SITE_DIR, 'site.css'), 'utf8')));

  copyFile(path.join(SITE_DIR, 'static', 'ice.webp'), path.join(outDir, 'ice.webp'));
  copyFile(path.join(SITE_DIR, 'static', 'media', 'intro.mp4'), path.join(outDir, 'media', 'intro.mp4'));
  copyFile(path.join(SITE_DIR, 'OFL-Unbounded.txt'), path.join(outDir, 'OFL-Unbounded.txt'));
  for (const p of collectImagePaths(content)) copyFile(path.join(assetsDir, p.replace(/^assets\//, '')), path.join(outDir, p));
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  log(`Сборка готова: ${rel(outDir) || '.'} (модулей: ${files.size}, картинок: ${collectImagePaths(content).length}).`);
  return { outDir, modules: [...files].map(rel) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { buildSite(); } catch (e) { console.error(e.message); process.exit(1); }
}
