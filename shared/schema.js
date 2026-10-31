// Схема контента сайта. Модуль не зависит ни от DOM, ни от Node, поэтому его
// используют публичный сайт, локальный редактор, сборка и тесты.

export const CONTENT_VERSION = 1;

export const LIMITS = Object.freeze({
  hero: 400,
  cta: 400,
  sections: 24,
  sectionName: 80,
  sectionDescription: 400,
  works: 120,
  workTitle: 80,
  workDescription: 400,
  priceTitle: 80,
  priceSubtitle: 400,
  priceNote: 400,
  priceItems: 80,
  itemTitle: 80,
  itemSummary: 300,
  itemPrice: 40,
  itemDetails: 3000,
});

// Картинки работ — только локальные файлы в assets/works/ (без data: и внешних URL).
export const IMAGE_PATH_RE = /^assets\/works\/[a-z0-9][a-z0-9._-]{0,100}\.(?:webp|jpe?g|png|avif)$/;
export const TELEGRAM_RE = /^https:\/\/(?:t|telegram)\.me\/[\w@\-/.?=&+]*$/i;

// Любые ключи с такими именами в контенте запрещены (секреты не должны попадать в репозиторий).
const SECRET_KEY_RE = /^(?:auth|password|passwd|pass|hash|salt|token|secret|session|key|rev)$/i;

const TOP_KEYS = ['version', 'telegram', 'hero', 'cta', 'sections', 'price'];
const SECTION_KEYS = ['name', 'description', 'works'];
const WORK_KEYS = ['title', 'description', 'image'];
const PRICE_KEYS = ['title', 'subtitle', 'note', 'items'];
const ITEM_KEYS = ['title', 'summary', 'price', 'details'];

export const isImagePath = (v) => typeof v === 'string' && IMAGE_PATH_RE.test(v);
export const isTelegramUrl = (v) => typeof v === 'string' && v.length <= 120 && TELEGRAM_RE.test(v);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Строгая проверка структуры. Возвращает список ошибок (пустой — контент корректен).
 * Неизвестные поля считаются ошибкой: так в контент не проберутся auth, токены и т.п.
 */
export function validateContent(content) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  const str = (obj, key, path, max, { required = false, nonEmpty = false } = {}) => {
    const v = obj[key];
    if (v === undefined) { if (required) err(`${path}.${key}`, 'поле обязательно'); return; }
    if (typeof v !== 'string') { err(`${path}.${key}`, 'должно быть строкой'); return; }
    if (v.length > max) err(`${path}.${key}`, `длина ${v.length} превышает ${max}`);
    if (nonEmpty && v.trim() === '') err(`${path}.${key}`, 'не должно быть пустым');
  };

  const noExtra = (obj, allowed, path) => {
    for (const k of Object.keys(obj)) {
      if (SECRET_KEY_RE.test(k)) err(`${path}.${k}`, 'секретные и служебные поля в контенте запрещены');
      else if (!allowed.includes(k)) err(`${path}.${k}`, 'неизвестное поле');
    }
  };

  const arr = (obj, key, path, max) => {
    const v = obj[key];
    if (!Array.isArray(v)) { err(`${path}.${key}`, 'должно быть массивом'); return []; }
    if (v.length > max) err(`${path}.${key}`, `элементов ${v.length}, максимум ${max}`);
    return v;
  };

  if (!isObj(content)) return ['$: контент должен быть объектом'];
  noExtra(content, TOP_KEYS, '$');

  if (content.version !== CONTENT_VERSION) err('$.version', `ожидается ${CONTENT_VERSION}`);

  if (typeof content.telegram !== 'string') err('$.telegram', 'должно быть строкой');
  else if (content.telegram !== '' && !isTelegramUrl(content.telegram)) {
    err('$.telegram', 'нужна ссылка вида https://t.me/ник');
  }
  str(content, 'hero', '$', LIMITS.hero, { required: true });
  str(content, 'cta', '$', LIMITS.cta, { required: true });

  arr(content, 'sections', '$', LIMITS.sections).forEach((s, i) => {
    const p = `$.sections[${i}]`;
    if (!isObj(s)) { err(p, 'должно быть объектом'); return; }
    noExtra(s, SECTION_KEYS, p);
    str(s, 'name', p, LIMITS.sectionName, { required: true, nonEmpty: true });
    str(s, 'description', p, LIMITS.sectionDescription, { required: true });
    arr(s, 'works', p, LIMITS.works).forEach((w, j) => {
      const q = `${p}.works[${j}]`;
      if (!isObj(w)) { err(q, 'должно быть объектом'); return; }
      noExtra(w, WORK_KEYS, q);
      str(w, 'title', q, LIMITS.workTitle, { required: true, nonEmpty: true });
      str(w, 'description', q, LIMITS.workDescription, { required: true });
      if (w.image !== null && !isImagePath(w.image)) {
        err(`${q}.image`, 'нужен null или путь вида assets/works/имя.webp (без data: и внешних ссылок)');
      }
    });
  });

  if (!isObj(content.price)) err('$.price', 'должно быть объектом');
  else {
    const pr = content.price;
    noExtra(pr, PRICE_KEYS, '$.price');
    str(pr, 'title', '$.price', LIMITS.priceTitle, { required: true, nonEmpty: true });
    str(pr, 'subtitle', '$.price', LIMITS.priceSubtitle, { required: true });
    str(pr, 'note', '$.price', LIMITS.priceNote, { required: true });
    arr(pr, 'items', '$.price', LIMITS.priceItems).forEach((it, i) => {
      const q = `$.price.items[${i}]`;
      if (!isObj(it)) { err(q, 'должно быть объектом'); return; }
      noExtra(it, ITEM_KEYS, q);
      str(it, 'title', q, LIMITS.itemTitle, { required: true, nonEmpty: true });
      str(it, 'summary', q, LIMITS.itemSummary, { required: true });
      str(it, 'price', q, LIMITS.itemPrice, { required: true });
      str(it, 'details', q, LIMITS.itemDetails, { required: true });
    });
  }
  return errors;
}

const clip = (v, n) => String(v ?? '').slice(0, n);
const list = (v) => (Array.isArray(v) ? v : []);

/**
 * Мягкая нормализация для рендера: никогда не бросает исключений, обрезает строки,
 * отбрасывает неизвестные поля и недопустимые URL. Результат безопасен для вставки
 * в страницу (текст всё равно экранируется при выводе).
 */
export function normalizeContent(raw) {
  const c = isObj(raw) ? raw : {};
  const price = isObj(c.price) ? c.price : {};
  return {
    version: CONTENT_VERSION,
    telegram: isTelegramUrl(c.telegram) ? c.telegram : '',
    hero: clip(c.hero, LIMITS.hero),
    cta: clip(c.cta, LIMITS.cta),
    sections: list(c.sections).slice(0, LIMITS.sections).map((s) => ({
      name: clip(s?.name, LIMITS.sectionName),
      description: clip(s?.description, LIMITS.sectionDescription),
      works: list(s?.works).slice(0, LIMITS.works).map((w) => ({
        title: clip(w?.title, LIMITS.workTitle),
        description: clip(w?.description, LIMITS.workDescription),
        image: isImagePath(w?.image) ? w.image : null,
      })),
    })),
    price: {
      title: clip(price.title || 'Прайс-лист', LIMITS.priceTitle),
      subtitle: clip(price.subtitle, LIMITS.priceSubtitle),
      note: clip(price.note, LIMITS.priceNote),
      items: list(price.items).slice(0, LIMITS.priceItems).map((x) => ({
        title: clip(x?.title, LIMITS.itemTitle),
        summary: clip(x?.summary, LIMITS.itemSummary),
        price: clip(x?.price, LIMITS.itemPrice),
        details: clip(x?.details, LIMITS.itemDetails),
      })),
    },
  };
}

export function emptyContent() {
  return normalizeContent({
    telegram: '', hero: '', cta: '', sections: [],
    price: { title: 'Прайс-лист', subtitle: '', note: '', items: [] },
  });
}

/** Все пути картинок, на которые ссылается контент (без повторов). */
export function collectImagePaths(content) {
  const out = new Set();
  for (const s of list(content?.sections)) {
    for (const w of list(s?.works)) if (isImagePath(w?.image)) out.add(w.image);
  }
  return [...out];
}
