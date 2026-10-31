// Обход графа ES-модулей: из точки входа находим все файлы, которые она может загрузить.
import fs from 'node:fs';
import path from 'node:path';

const STATIC_RE = /(?:^|[;\s}])(?:import|export)\s*(?:[\w*${}\s,]*?\s*from\s*)?(['"])([^'"\n]+)\1/g;
const DYNAMIC_RE = /\bimport\s*\(\s*([^)]*)\)/g;
const WORKER_RE = /\bnew\s+(?:Shared)?Worker\s*\(|\bimportScripts\s*\(|\brequire\s*\(/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

export function findImports(source) {
  const src = stripComments(source);
  const specs = [];
  let m;
  STATIC_RE.lastIndex = 0;
  while ((m = STATIC_RE.exec(src))) specs.push({ spec: m[2], kind: 'static' });
  DYNAMIC_RE.lastIndex = 0;
  while ((m = DYNAMIC_RE.exec(src))) {
    const lit = /^(['"])([^'"]+)\1$/.exec(m[1].trim());
    specs.push(lit ? { spec: lit[2], kind: 'dynamic' } : { spec: m[1].trim(), kind: 'computed' });
  }
  return { specs, indirect: WORKER_RE.test(src) };
}

/**
 * Возвращает { files: Set<абсолютный путь>, problems: string[] }.
 * Проблемы: импорт не из файла, неразрешимый/вычисляемый импорт, bare-пакеты, node:-модули.
 */
export function walkModules(entry) {
  const files = new Set();
  const problems = [];
  const queue = [path.resolve(entry)];
  while (queue.length) {
    const file = queue.pop();
    if (files.has(file)) continue;
    if (!fs.existsSync(file)) { problems.push(`нет файла: ${file}`); continue; }
    files.add(file);
    const { specs, indirect } = findImports(fs.readFileSync(file, 'utf8'));
    if (indirect) problems.push(`${file}: worker/importScripts/require недопустимы в публичном коде`);
    for (const { spec, kind } of specs) {
      if (kind === 'computed') { problems.push(`${file}: вычисляемый import(${spec})`); continue; }
      if (!spec.startsWith('.')) { problems.push(`${file}: импорт не из проекта: ${spec}`); continue; }
      queue.push(path.resolve(path.dirname(file), spec));
    }
  }
  return { files, problems };
}
