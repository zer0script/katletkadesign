import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../scripts/lib/paths.mjs';

export const tmpDir = (p = 'pf-test-') => fs.mkdtempSync(path.join(os.tmpdir(), p));

/** Копия контента и картинок во временный каталог, чтобы тесты не трогали рабочие файлы. */
export function copyContent() {
  const dir = tmpDir();
  fs.cpSync(path.join(ROOT, 'content'), path.join(dir, 'content'), { recursive: true });
  return { dir, contentFile: path.join(dir, 'content', 'content.json'), assetsDir: path.join(dir, 'content', 'assets') };
}
// Минимальный валидный WebP-заголовок (RIFF....WEBP) для проверки загрузки.
export const tinyWebp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.from([20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(16, 1)]);
