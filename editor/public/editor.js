import { LIMITS, isTelegramUrl, validateContent } from '/shared/schema.js';

const TOKEN = document.querySelector('meta[name="editor-token"]').content;
const DRAFT_KEY = 'portfolio-editor-draft-v1';
const $ = (s) => document.querySelector(s);

let content = null, saved = '', tab = 'texts', secIdx = 0, dirty = false;

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'X-Editor-Token': TOKEN, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Ошибка ${res.status}`); e.errors = data.errors; throw e; }
  return data;
}

function setState(text, cls = '') { const s = $('#state'); s.textContent = text; s.className = cls; }
function markDirty() {
  dirty = JSON.stringify(content) !== saved;
  setState(dirty ? 'Есть несохранённые изменения' : 'Всё сохранено', dirty ? 'dirty' : 'ok');
  try { dirty ? localStorage.setItem(DRAFT_KEY, JSON.stringify(content)) : localStorage.removeItem(DRAFT_KEY); } catch {}
}
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

const field = (label, obj, key, { max, area = false, ph = '' } = {}) => {
  const input = h(area ? 'textarea' : 'input', { type: area ? null : 'text', maxlength: max, placeholder: ph });
  input.value = obj[key] ?? '';
  const cnt = h('span', { class: 'cnt' }, max ? `${input.value.length}/${max}` : '');
  input.addEventListener('input', () => { obj[key] = input.value; if (max) cnt.textContent = `${input.value.length}/${max}`; markDirty(); });
  return h('label', {}, h('span', {}, label, cnt), input);
};

const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
const confirmDel = (what) => confirm(`Удалить: ${what}?`);
const rerender = () => { render(); markDirty(); };

function listButtons(arr, i, { onDelete, label }) {
  return h('div', { class: 'row' },
    h('button', { class: 'sm', type: 'button', disabled: i === 0, 'aria-label': 'Вверх', onclick: () => { move(arr, i, -1); rerender(); } }, '↑'),
    h('button', { class: 'sm', type: 'button', disabled: i === arr.length - 1, 'aria-label': 'Вниз', onclick: () => { move(arr, i, 1); rerender(); } }, '↓'),
    h('button', { class: 'sm danger', type: 'button', onclick: () => { if (confirmDel(label)) { arr.splice(i, 1); onDelete?.(); rerender(); } } }, 'Удалить'));
}

/* ---- картинки: сжатие в браузере, затем загрузка на локальный сервер ---- */
async function shrink(file) {
  if (!/^image\//.test(file.type)) throw new Error('Нужен файл-картинка');
  const bmp = await createImageBitmap(file);
  let blob = null;
  for (const [mx, q] of [[1600, .85], [1400, .78], [1100, .72], [800, .66]]) {
    const k = Math.min(1, mx / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= 900000) break;
  }
  return blob;
}
async function uploadImage(file, work) {
  setState('Загружаю картинку…');
  try {
    const blob = await shrink(file);
    const r = await api('/api/images', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    work.image = r.path; rerender();
  } catch (e) { setState(e.message, 'err'); }
}

/* ---- вкладки ---- */
function viewTexts() {
  const box = h('div', { class: 'box' }, h('h2', {}, 'Тексты и контакты'));
  const tg = field('Ссылка на Telegram (https://t.me/ник)', content, 'telegram', { max: 120 });
  const tgIn = tg.querySelector('input'), msg = h('p', { class: 'hint' });
  tgIn.addEventListener('input', () => { msg.textContent = !content.telegram || isTelegramUrl(content.telegram) ? '' : 'Нужна ссылка вида https://t.me/ник'; });
  box.append(field('Текст на первом экране (под заголовком)', content, 'hero', { max: LIMITS.hero, area: true }),
    field('Текст внизу сайта (над значком Telegram)', content, 'cta', { max: LIMITS.cta, area: true }), tg, msg);
  return box;
}

function viewSections() {
  const wrap = h('div');
  secIdx = Math.min(secIdx, content.sections.length - 1);
  const bar = h('div', { class: 'secs' }, content.sections.map((s, i) => h('button', { type: 'button', class: i === secIdx ? 'on' : '', onclick: () => { secIdx = i; render(); } }, s.name || '(без названия)')),
    h('button', { type: 'button', onclick: () => { const n = prompt('Название новой папки'); if (n && n.trim()) { content.sections.push({ name: n.trim().slice(0, LIMITS.sectionName), description: '', works: [] }); secIdx = content.sections.length - 1; rerender(); } } }, '+ Папка'));
  wrap.append(bar);
  const s = content.sections[secIdx];
  if (!s) { wrap.append(h('p', { class: 'hint' }, 'Папок пока нет.')); return wrap; }
  wrap.append(h('div', { class: 'box' }, h('h2', {}, 'Папка'),
    field('Название', s, 'name', { max: LIMITS.sectionName }), field('Описание', s, 'description', { max: LIMITS.sectionDescription, area: true }),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'sm', disabled: secIdx === 0, onclick: () => { move(content.sections, secIdx, -1); secIdx--; rerender(); } }, '← Левее'),
      h('button', { type: 'button', class: 'sm', disabled: secIdx === content.sections.length - 1, onclick: () => { move(content.sections, secIdx, 1); secIdx++; rerender(); } }, 'Правее →'),
      h('button', { type: 'button', class: 'sm danger', onclick: () => { if (confirmDel(`папку «${s.name}» со всеми работами (${s.works.length})`)) { content.sections.splice(secIdx, 1); secIdx = Math.max(0, secIdx - 1); rerender(); } } }, 'Удалить папку'))));
  const works = h('div', { class: 'box' }, h('h2', {}, `Работы (${s.works.length})`));
  s.works.forEach((w, i) => {
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (f) uploadImage(f, w); } });
    works.append(h('div', { class: 'item work' },
      w.image ? h('img', { class: 'thumb', src: '/' + w.image, alt: '' }) : h('div', { class: 'thumb' }, 'без картинки'),
      h('div', {}, field('Название', w, 'title', { max: LIMITS.workTitle }), field('Подпись', w, 'description', { max: LIMITS.workDescription }),
        h('div', { class: 'row' }, fileIn, h('button', { type: 'button', class: 'sm', onclick: () => fileIn.click() }, w.image ? 'Заменить картинку' : 'Добавить картинку'),
          w.image ? h('button', { type: 'button', class: 'sm', onclick: () => { w.image = null; rerender(); } }, 'Убрать картинку') : null,
          listButtons(s.works, i, { label: `работу «${w.title}»` })))));
  });
  works.append(h('button', { type: 'button', onclick: () => { s.works.push({ title: 'Новая работа', description: '', image: null }); rerender(); } }, '+ Работа'));
  wrap.append(works);
  return wrap;
}

function viewPrice() {
  const P = content.price, wrap = h('div');
  wrap.append(h('div', { class: 'box' }, h('h2', {}, 'Прайс-лист'),
    field('Заголовок', P, 'title', { max: LIMITS.priceTitle }), field('Подзаголовок', P, 'subtitle', { max: LIMITS.priceSubtitle, area: true }),
    field('Текст под прайсом', P, 'note', { max: LIMITS.priceNote, area: true })));
  const items = h('div', { class: 'box' }, h('h2', {}, `Позиции (${P.items.length})`));
  P.items.forEach((x, i) => items.append(h('div', { class: 'item' },
    field('Название', x, 'title', { max: LIMITS.itemTitle }), field('Коротко (видно в списке)', x, 'summary', { max: LIMITS.itemSummary }),
    field('Цена', x, 'price', { max: LIMITS.itemPrice }), field('Полная информация (раскрывается по нажатию)', x, 'details', { max: LIMITS.itemDetails, area: true }),
    listButtons(P.items, i, { label: `позицию «${x.title}»` }))));
  items.append(h('button', { type: 'button', onclick: () => { P.items.push({ title: 'Новая позиция', summary: '', price: '', details: '' }); rerender(); } }, '+ Позиция'));
  wrap.append(items);
  return wrap;
}

const TABS = { texts: ['Тексты', viewTexts], sections: ['Папки и работы', viewSections], price: ['Прайс', viewPrice] };
function render() {
  $('#tabs').replaceChildren(...Object.entries(TABS).map(([k, [label]]) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; render(); } }, label)));
  $('#view').replaceChildren(TABS[tab][1]());
}

function banner(text, cls, ...btns) {
  const b = $('#banner'); b.className = cls || ''; b.hidden = !text; b.replaceChildren(...(text ? [text, ...btns] : []));
}

async function save() {
  const local = validateContent(content);
  if (local.length) { banner('Исправьте ошибки:\n' + local.join('\n'), 'err'); return; }
  setState('Сохраняю…');
  try {
    const r = await api('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) });
    saved = JSON.stringify(content); banner('');
    markDirty(); setState(r.removed?.length ? `Сохранено. Удалено неиспользуемых картинок: ${r.removed.length}` : 'Сохранено в content/', 'ok');
  } catch (e) { banner('Не сохранено: ' + e.message + (e.errors ? '\n' + e.errors.join('\n') : ''), 'err'); setState('Ошибка сохранения', 'err'); }
}
$('#save').addEventListener('click', save);
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });

(async function init() {
  try { content = (await api('/api/content')).content; } catch (e) { banner('Не удалось загрузить контент: ' + e.message, 'err'); return; }
  saved = JSON.stringify(content);
  let draft = null; try { draft = localStorage.getItem(DRAFT_KEY); } catch {}
  if (draft && draft !== saved) {
    banner('Найден несохранённый черновик правок в этом браузере. Он не попадёт на сайт, пока вы не нажмёте «Сохранить в файлы».', '',
      h('button', { type: 'button', onclick: () => { content = JSON.parse(draft); render(); banner(''); markDirty(); } }, 'Восстановить'),
      h('button', { type: 'button', onclick: () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} banner(''); } }, 'Отбросить'));
  }
  render(); setState('Всё сохранено', 'ok');
})();
