import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT_FILE = path.join(ROOT, 'content', 'content.json');
export const ASSETS_DIR = path.join(ROOT, 'content', 'assets');
export const WORKS_DIR = path.join(ASSETS_DIR, 'works');
export const SITE_DIR = path.join(ROOT, 'site');
export const DIST_DIR = path.join(ROOT, 'dist');
export const PUBLIC_ENTRY = path.join(SITE_DIR, 'main.js');
// Публикуется только то, что собрано в dist; путь сайта на GitHub Pages — /katletkadesign/,
// поэтому в сборке используются только относительные ссылки.
export const BASE_PATH = '/katletkadesign/';

export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
