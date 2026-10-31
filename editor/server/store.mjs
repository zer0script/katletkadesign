// Чтение и запись контента. Единственное место, где редактор пишет на диск.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateContent, collectImagePaths, IMAGE_PATH_RE } from '../../shared/schema.js';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_JSON_BYTES = 1024 * 1024;

const SIGNATURES = [
  { ext: 'webp', test: (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
];

export function detectImageExt(buf) {
  const s = SIGNATURES.find((x) => x.test(buf));
  return s ? s.ext : null;
}

export class ContentStore {
  constructor({ contentFile, assetsDir }) {
    this.contentFile = path.resolve(contentFile);
    this.assetsDir = path.resolve(assetsDir);
    this.worksDir = path.join(this.assetsDir, 'works');
  }

  read() {
    return JSON.parse(fs.readFileSync(this.contentFile, 'utf8'));
  }

  /** Путь вида assets/works/x.webp -> абсолютный путь внутри каталога работ либо null. */
  resolveImage(p) {
    if (typeof p !== 'string' || !IMAGE_PATH_RE.test(p)) return null;
    const abs = path.resolve(this.assetsDir, p.replace(/^assets\//, ''));
    return abs.startsWith(this.worksDir + path.sep) ? abs : null;
  }

  validate(content) {
    const errors = validateContent(content);
    if (errors.length) return errors;
    for (const p of collectImagePaths(content)) {
      const abs = this.resolveImage(p);
      if (!abs || !fs.existsSync(abs)) errors.push(`${p}: файл картинки не найден (сначала загрузите картинку)`);
    }
    return errors;
  }

  /** Сохраняет контент атомарно и удаляет картинки, на которые больше никто не ссылается. */
  save(content) {
    const errors = this.validate(content);
    if (errors.length) return { ok: false, errors };
    const text = JSON.stringify(content, null, 2) + '\n';
    const tmp = `${this.contentFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, this.contentFile);
    const removed = this.pruneImages(content);
    return { ok: true, removed };
  }

  pruneImages(content) {
    const used = new Set(collectImagePaths(content).map((p) => path.basename(p)));
    const removed = [];
    if (!fs.existsSync(this.worksDir)) return removed;
    for (const name of fs.readdirSync(this.worksDir)) {
      if (used.has(name) || !IMAGE_PATH_RE.test(`assets/works/${name}`)) continue;
      const abs = path.join(this.worksDir, name);
      if (fs.statSync(abs).isFile()) { fs.unlinkSync(abs); removed.push(`assets/works/${name}`); }
    }
    return removed;
  }

  /** Имя файла назначает сервер (хеш содержимого); имя от клиента не используется. */
  saveImage(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw Object.assign(new Error('пустой файл'), { status: 400 });
    if (buf.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('файл слишком большой'), { status: 413 });
    const ext = detectImageExt(buf);
    if (!ext) throw Object.assign(new Error('поддерживаются только WebP, JPEG и PNG'), { status: 415 });
    const name = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)}.${ext}`;
    fs.mkdirSync(this.worksDir, { recursive: true });
    const abs = path.join(this.worksDir, name);
    if (!fs.existsSync(abs)) {
      const tmp = `${abs}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, abs);
    }
    return `assets/works/${name}`;
  }
}
