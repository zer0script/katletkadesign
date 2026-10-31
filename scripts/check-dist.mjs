// Проверка публичной сборки: состав артефакта, граф модулей, отсутствие редакторского кода и данных auth,
// существование локальных ресурсов. Запуск: npm run check
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIST_DIR } from './lib/paths.mjs';
import { walkModules, findImports } from './lib/graph.mjs';
import { validateContent, collectImagePaths } from '../shared/schema.js';

const ALLOWED_TOP = new Set(['index.html', 'site.css', 'ice.webp', 'media', 'assets', 'js', 'OFL-Unbounded.txt', '.nojekyll']);
const FORBIDDEN_NAME = /(^|\/)(editor|scripts|tests|node_modules|\.git|\.github|content)(\/|$)|\.map$|^package(-lock)?\.json$|\.mjs$|\.md$|\.env/i;
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.webp', '.jpg', '.jpeg', '.png', '.avif', '.mp4', '.txt', '']);
// Признаки редакторского кода. Это вторичная проверка: основная — состав файлов и граф модулей.
const FORBIDDEN_CODE = [
  /\bsetEdit\b/, /\bunlock\s*\(/, /PBKDF2/i, /deriveBits/, /importKey/, /indexedDB/i, /outerHTML/, /localStorage/,
  /showSaveFilePicker/, /pf_lock|pf_s\b/, /X-Editor-Token/i, /\/api\//, /createObjectURL/, /\bFileReader\b/, /\.download\s*=/,
];
const FORBIDDEN_MARKUP = [/id="(?:bar|dlg|d-form|d-a|d-b|d-c|d-d|d-f|b-sec|b-tg|b-txt|b-pub|b-out)"/, /type="file"/, /<form\b/, /<input\b/, /<textarea\b/, /contenteditable/i];
const FORBIDDEN_DATA_KEYS = /"(?:auth|rev|password|hash|salt|token|secret|session)"\s*:/i;

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(abs, base) : [path.relative(base, abs).split(path.sep).join('/')];
  });
}

export function checkDist(dist = DIST_DIR) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (!fs.existsSync(path.join(dist, 'index.html'))) return ['нет dist/index.html — сначала npm run build'];

  const files = listFiles(dist);
  for (const f of files) {
    if (!ALLOWED_TOP.has(f.split('/')[0])) bad(`лишний файл в артефакте: ${f}`);
    if (FORBIDDEN_NAME.test(f)) bad(`запрещённый файл в артефакте: ${f}`);
    if (!ALLOWED_EXT.has(path.extname(f).toLowerCase())) bad(`неожиданный тип файла: ${f}`);
  }

  // Граф модулей: из index.html -> module script -> только файлы внутри dist/js, и все .js достижимы.
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  const exec = scripts.filter((a) => !/type="application\/json"/.test(a));
  if (exec.length !== 1 || !/type="module"/.test(exec[0]) || !/src="js\/site\/main\.js"/.test(exec[0])) bad('в HTML должен быть ровно один исполняемый скрипт: js/site/main.js');
  if (/<script\b(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>/.test(html)) bad('в HTML есть inline-скрипт');
  if (/\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) bad('в HTML есть inline-обработчики событий');
  const entry = path.join(dist, 'js', 'site', 'main.js');
  if (fs.existsSync(entry)) {
    const { files: graph, problems } = walkModules(entry);
    problems.forEach(bad);
    const reachable = new Set([...graph].map((f) => path.relative(dist, f).split(path.sep).join('/')));
    for (const f of reachable) if (!/^js\/(site|shared)\//.test(f)) bad(`граф тянет недопустимый модуль: ${f}`);
    for (const f of files.filter((x) => x.startsWith('js/'))) if (!reachable.has(f)) bad(`JS не достижим из точки входа (лишний файл): ${f}`);
  } else bad('нет dist/js/site/main.js');

  // Текстовое содержимое.
  for (const f of files.filter((x) => /\.(js|html|css)$/.test(x))) {
    const text = fs.readFileSync(path.join(dist, f), 'utf8');
    if (f.endsWith('.js')) for (const re of FORBIDDEN_CODE) if (re.test(text)) bad(`${f}: признак редакторского кода ${re}`);
    if (f.endsWith('.html')) for (const re of FORBIDDEN_MARKUP) if (re.test(html)) bad(`${f}: редакторская разметка ${re}`);
    if (/sourceMappingURL/.test(text)) bad(`${f}: ссылка на source map`);
    if (/data:[a-z/+-]+;base64,/i.test(text) && f.endsWith('.html')) bad(`${f}: встроенные base64-данные (картинки должны быть файлами)`);
    if (!f.endsWith('.js') && /(?:src|href)="\/(?!\/)/.test(text)) bad(`${f}: абсолютный путь от корня домена (сайт живёт в /katletkadesign/)`);
    if (/url\(\s*["']?\//.test(text) && f.endsWith('.css')) bad(`${f}: абсолютный url() в CSS`);
  }

  // Встроенные данные: схема, отсутствие auth, существование картинок.
  const m = /<script type="application\/json" id="site-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) bad('нет встроенных данных сайта');
  else {
    if (FORBIDDEN_DATA_KEYS.test(m[1])) bad('в данных сайта есть поля auth/rev/секретов');
    try {
      const data = JSON.parse(m[1]);
      validateContent(data).forEach((e) => bad(`данные сайта: ${e}`));
      for (const p of collectImagePaths(data)) if (!fs.existsSync(path.join(dist, p))) bad(`нет файла картинки в сборке: ${p}`);
    } catch (e) { bad('данные сайта — некорректный JSON'); }
  }

  // Локальные ссылки в HTML и CSS существуют и относительны.
  const refs = [...html.matchAll(/\s(?:src|href)="([^"#]+)"/g)].map((x) => x[1]).filter((u) => !/^(https?:|mailto:|data:)/.test(u));
  for (const u of refs) if (!fs.existsSync(path.join(dist, u))) bad(`index.html ссылается на отсутствующий файл: ${u}`);
  const css = fs.existsSync(path.join(dist, 'site.css')) ? fs.readFileSync(path.join(dist, 'site.css'), 'utf8') : '';
  for (const x of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) if (!/^(https?:|data:|#)/.test(x[1]) && !fs.existsSync(path.join(dist, x[1]))) bad(`site.css ссылается на отсутствующий файл: ${x[1]}`);
  if (!fs.existsSync(path.join(dist, 'media', 'intro.mp4'))) bad('нет media/intro.mp4');
  else if (!/video\/mp4|ftyp/.test(fs.readFileSync(path.join(dist, 'media', 'intro.mp4')).subarray(4, 12).toString('latin1'))) bad('media/intro.mp4 не похож на MP4');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkDist();
  if (errors.length) { console.error('Проверка сборки не пройдена:\n' + errors.map((e) => '  - ' + e).join('\n')); process.exit(1); }
  console.log('Сборка чистая: редакторского кода, данных auth и лишних файлов нет; все ссылки существуют.');
}
