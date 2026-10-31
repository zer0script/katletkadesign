import fs from 'node:fs';
import path from 'node:path';
import { validateContent, collectImagePaths } from '../../shared/schema.js';
import { ASSETS_DIR, CONTENT_FILE } from './paths.mjs';

export function readContent(file = CONTENT_FILE) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new Error(`не удалось прочитать ${file}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new Error(`content.json — некорректный JSON: ${e.message}`); }
}

/** Проверка структуры и того, что все картинки существуют. Возвращает список ошибок. */
export function checkContent(content, assetsDir = ASSETS_DIR) {
  const errors = validateContent(content);
  if (errors.length) return errors;
  for (const p of collectImagePaths(content)) {
    const abs = path.join(assetsDir, p.replace(/^assets\//, ''));
    const root = path.resolve(assetsDir) + path.sep;
    if (!path.resolve(abs).startsWith(root)) errors.push(`${p}: выходит за пределы assets`);
    else if (!fs.existsSync(abs)) errors.push(`${p}: файл не найден в content/assets`);
    else if (fs.statSync(abs).size === 0) errors.push(`${p}: пустой файл`);
  }
  return errors;
}
