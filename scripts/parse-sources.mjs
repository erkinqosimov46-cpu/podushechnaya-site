#!/usr/bin/env node
// Парсер: sources/{акт}/{ru|uz}.html.gz → content/{акт}/{ru|uz}.json
//
//   npm run parse                     — все акты
//   npm run parse -- --only bk,mj-2850
//
// Структура повторяет источник 1:1:
//   законы и кодексы:  раздел/бўлим → подраздел → глава/боб → § → статья/модда
//                      (внутри статьи у каждого абзаца: часть/қисм, пункт/банд, подпункт, абзац/хатбоши)
//   подзаконные акты:  [приложение/илова] → глава/боб → § → пункт/банд
//                      (внутри пункта: подпункт/кичик банд, абзац/хатбоши)
// ID узлов не зависят от языка (m357, a1.b45, a1.ch4), поэтому RU и UZ версии сопоставляются по ID.
// Официальный текст не изменяется: сохраняется HTML абзаца с минимальной разметкой (b, i, sup, sub, br, ссылки, таблицы).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';
import { headingOrdinal, roman, ruOrdinal, uzOrdinal } from './lib/ordinals.mjs';
import { latnToCyrl } from './lib/translit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;
const FULL = args.includes('--full'); // отладка: без фильтра профильных статей, вывод в .dev/full

const registry = JSON.parse(await readFile(join(ROOT, 'content', 'acts.json'), 'utf8'));
const ARTICLE_KINDS = new Set(['konst', 'kodeks', 'zru']);

// ───────────────────────── HTML → чистый HTML абзаца ─────────────────────────

const KEEP = new Set(['b', 'strong', 'i', 'em', 'u', 'sup', 'sub', 'br', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a']);
const RENAME = { strong: 'b', em: 'i' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');

function cleanHtml(node, lang) {
  let out = '';
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) {
      out += esc(decode(ch.rawText));
      continue;
    }
    if (ch.nodeType !== 1) continue;
    const tag = ch.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'img' || tag === 'label') continue;
    const inner = cleanHtml(ch, lang);
    if (!KEEP.has(tag)) {
      out += inner;
      continue;
    }
    const t = RENAME[tag] ?? tag;
    if (t === 'br') {
      out += '<br>';
      continue;
    }
    let attrs = '';
    if (t === 'a') {
      const href = ch.getAttribute('href') ?? '';
      if (!href || href.startsWith('javascript')) {
        out += inner;
        continue;
      }
      attrs = ` href="${esc(href.startsWith('/') ? 'https://lex.uz' + href.replace(/ /g, '%20') : href)}"`;
    }
    if (t === 'td' || t === 'th') {
      for (const k of ['colspan', 'rowspan']) {
        const v = ch.getAttribute(k);
        if (v && /^\d+$/.test(v) && v !== '1') attrs += ` ${k}="${v}"`;
      }
    }
    out += `<${t}${attrs}>${inner}</${t}>`;
  }
  return out;
}

const tidy = (html) =>
  html
    .replace(/\s+/g, ' ')
    .replace(/<(b|i|u|sup|sub)>\s*<\/\1>/g, '')
    .replace(/\s+(<\/(?:b|i|u)>)/g, '$1 ')
    .trim();

/** Плоский текст; верхний индекс → ^N (175<sup>1</sup> → 175^1). */
const plain = (html) =>
  decode(html.replace(/[\u200e\u200f\u200b]/g, '').replace(/<sup>\s*([^<]*?)\s*<\/sup>/g, '^$1').replace(/<br>/g, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

// ───────────────────────── Разбор элементов lex.uz ─────────────────────────

/** Каждый ребёнок #divCont — один элемент документа: класс + div с id элемента. */
function elements(html, lang) {
  const root = parse(html);
  const cont = root.querySelector('#divCont');
  if (!cont) return { items: [], toc: [] };
  const items = [];
  for (const el of cont.childNodes) {
    if (el.nodeType !== 1) continue;
    const cls = (el.getAttribute('class') ?? '').split(' ')[0];
    const body = el.childNodes.find((x) => x.nodeType === 1 && x.getAttribute('id') && x.tagName === 'DIV');
    if (!body) continue;
    const lexNote = cls === 'COMMENT' && !!el.querySelector('.COMMENTLEXUZ');
    const h = tidy(cleanHtml(body, lang));
    items.push({ cls, lexId: body.getAttribute('id').replace(/^edi/, ''), html: h, text: plain(h), lexNote });
  }
  // Оглавление lex.uz (боковая панель) — независимый источник для сверки.
  const toc = [...html.matchAll(/scrollText\('(-?\d+)'\);"\s*>([\s\S]*?)<\/a>/g)].map((m) => ({
    lexId: m[1],
    text: plain(m[2]),
  }));
  return { items, toc };
}

const HEAD_CLASSES = new Set([
  'ACCEPTING_BODY', 'ACT_FORM', 'ACT_TITLE', 'DEPARTMENTAL', 'GRIF_PARLAMENT', 'EXTRACT', 'NEW_EDITION', 'UNOFFIAL', 'OFFICIAL_SOUR_TEXT',
]);
const SIGN_CLASSES = new Set(['SIGNATURE', 'ACT_ESSENTIAL_ELEMENTS', 'ACT_ESSENTIAL_ELEMENTS_NUM', 'PUBLICATION_ORIGIN']);
const TEXT_CLASSES = new Set(['ACT_TEXT', 'BY_DEFAULT', 'TEXT_CENTER', 'TEXT_BOLD_CENTER', 'TEXT_RIGHT', 'TABLE_STD', 'TABLE_STD2', 'FOOTNOTE', 'EXPLANATION']);
const BLOCK_KIND = {
  ACT_TEXT: 'p', BY_DEFAULT: 'p', TEXT_CENTER: 'center', TEXT_BOLD_CENTER: 'center', TEXT_RIGHT: 'right',
  TABLE_STD: 'table', TABLE_STD2: 'table', FOOTNOTE: 'footnote', EXPLANATION: 'lexnote',
};

// ───────────────────────── Заголовки ─────────────────────────

const LEVEL = { codePart: 0, section: 1, subsection: 2, chapter: 3, paragraph: 4, heading: 5 };
const R = '([IVXLCХІ]+)';

/** Определяет тип и номер заголовка. Номер — строка (для ID), метка — как в источнике. */
function classifyHeading(text) {
  const t = text.trim();
  let m;
  if ((m = t.match(/^(ОБЩАЯ|ОСОБЕННАЯ)\s+ЧАСТЬ$/i))) return { type: 'codePart', num: /общ/i.test(m[1]) ? '1' : '2', label: t, title: '' };
  if ((m = t.match(/^(УМУМИЙ|МАХСУС)\s+ҚИСМ$/i))) return { type: 'codePart', num: /умумий/i.test(m[1]) ? '1' : '2', label: t, title: '' };
  if ((m = t.match(/^Часть\s+(первая|вторая)$/i))) return { type: 'codePart', num: /перв/i.test(m[1]) ? '1' : '2', label: t, title: '' };
  if ((m = t.match(/^(Биринчи|Иккинчи)\s+қисм$/i))) return { type: 'codePart', num: /биринчи/i.test(m[1]) ? '1' : '2', label: t, title: '' };
  if ((m = t.match(/^Подраздел\s+(\d+)\.?\s*(.*)$/i))) return { type: 'subsection', num: m[1], label: `Подраздел ${m[1]}`, title: m[2] };
  if ((m = t.match(/^(\d+)-кичик\s+бўлим\.?\s*(.*)$/i))) return { type: 'subsection', num: m[1], label: `${m[1]}-кичик бўлим`, title: m[2] };
  if ((m = t.match(new RegExp(`^(?:РАЗДЕЛ|Раздел)\\s+${R}\\.?\\s*(.*)$`)))) return { type: 'section', num: String(roman(m[1])), label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(/^(?:РАЗДЕЛ|Раздел)\s+(\d+)\.?\s*(.*)$/))) return { type: 'section', num: m[1], label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(/^(?:РАЗДЕЛ|Раздел)\s+([А-ЯЁа-яё]+)\.?\s*(.*)$/)) && headingOrdinal(m[1])) return { type: 'section', num: String(headingOrdinal(m[1])), label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(new RegExp(`^${R}\\s*(?:-\\s*)?бўлим\\.?\\s*(.*)$`, 'i')))) return { type: 'section', num: String(roman(m[1])), label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(/^(\d+)-бўлим\.?\s*(.*)$/i))) return { type: 'section', num: m[1], label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(/^([А-ЯЁЎҚҒҲа-яёўқғҳ]+)\s+бўлим\.?\s*(.*)$/i)) && headingOrdinal(m[1])) return { type: 'section', num: String(headingOrdinal(m[1])), label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(new RegExp(`^(?:ГЛАВА|Глава)\\s+${R}(\\^\\d+)?\\.?\\s*(.*)$`)))) return { type: 'chapter', num: roman(m[1]) + (m[2] ?? ''), label: t.slice(0, t.length - m[3].length).trim(), title: m[3] };
  if ((m = t.match(/^(?:ГЛАВА|Глава)\s+(\d+)(\^\d+)?\.?\s*(.*)$/))) return { type: 'chapter', num: m[1] + (m[2] ?? ''), label: t.slice(0, t.length - m[3].length).trim(), title: m[3] };
  if ((m = t.match(new RegExp(`^${R}(\\^\\d+)?\\s*(?:-\\s*)?боб\\.?\\s*(.*)$`, 'i')))) return { type: 'chapter', num: roman(m[1]) + (m[2] ?? ''), label: t.slice(0, t.length - m[3].length).trim(), title: m[3] };
  if ((m = t.match(/^(\d+)(\^\d+)?\s*-\s*боб\.?\s*(.*)$/i))) return { type: 'chapter', num: m[1] + (m[2] ?? ''), label: t.slice(0, t.length - m[3].length).trim(), title: m[3] };
  if ((m = t.match(/^§\s*(\d+(?:\.\d+)?)\.?\s*(.*)$/))) return { type: 'paragraph', num: m[1], label: `§ ${m[1]}`, title: m[2] };
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*-\s*§\.?\s*(.*)$/))) return { type: 'paragraph', num: m[1], label: `${m[1]}-§`, title: m[2] };
  if ((m = t.match(new RegExp(`^${R}\\.\\s+(.*)$`)))) return { type: 'chapter', num: String(roman(m[1])), label: t.slice(0, t.length - m[2].length).trim(), title: m[2] };
  if ((m = t.match(/^(\d+\.\d+)\.?\s+(.*)$/))) return { type: 'paragraph', num: m[1], label: m[1], title: m[2] };
  if ((m = t.match(/^(\d+)\.\s+(.*)$/))) return { type: 'chapter', num: m[1], label: `${m[1]}.`, title: m[2] };
  return { type: 'heading', num: null, label: '', title: t };
}

/** Статья: «Статья 175^1. Название» / «175^1-модда. Номи». Цитаты из изменяющих законов («Статья…») — не статьи. */
function classifyArticle(text, lang, strict = false) {
  const t = text.trim();
  if (/^[«"„]/.test(t)) return null;
  const dot = strict ? '\\.' : '\\.?';
  const m = lang === 'ru'
    ? t.match(new RegExp(`^Статья\\s+(\\d+(?:\\^\\d+)?)\\s*${dot}\\s*(.*)$`))
    : t.match(new RegExp(`^(\\d+(?:\\^\\d+)?)\\s*-\\s*модда\\s*${dot}\\s*(.*)$`, 'i'));
  return m ? { num: m[1], title: m[2] } : null;
}

const POINT_RE = /^(\d{1,3}(?:\^\d+)?(?:\.\d{1,2}){0,2})\.\s+/; // «45. …», «4.2. …»
const ITEM_RE = /^(\d{1,3}(?:\^\d+)?)\)\s*/; // «1) …»
const LETTER_RE = /^\(?([а-яёўқғҳ](?:\^\d+)?|[ivx]{1,4})\)\s*/i; // «а) …», «(а) …», «(ii) …»

/** «(пункт 5 утратил силу …)», «(6-банд … ўз кучини йўқотган)», «(статьи 43 — 45 утратили силу …)» → номера. */
function repealedLeaves(text, lang) {
  let m;
  if (lang === 'ru') {
    if ((m = text.match(/^\((?:пункт|статья)\s+(\d+(?:\^\d+)?)\s+(?:утратил|утратила|исключен|исключена)(?![а-яё])/i))) return [m[1]];
    if ((m = text.match(/^\((?:пункты|статьи)\s+(\d+)\s*[—–-]\s*(\d+)\s+(?:утратили|исключены)(?![а-яё])/i))) return range(+m[1], +m[2]);
    if ((m = text.match(/^\(дата утраты силы (?:статьи|пункта)\s+(\d+(?:\^\d+)?)\s/i))) return [m[1]];
    if ((m = text.match(/^\((?:пункты|статьи)\s+(\d+)\s+и\s+(\d+)\s+(?:утратили|исключены)(?![а-яё])/i))) return [m[1], m[2]];
    return null;
  }
  if ((m = text.match(/асосан\s+(\d+(?:\^\d+)?)\s*-\s*(?:модда|банд)нинг\s+ўз\s+кучини\s+йўқот/))) return [m[1]];
  if (!/(ўз кучини йўқотган|чиқарилган)/.test(text)) return null;
  if ((m = text.match(/^\(\s*(\d+(?:\^\d+)?)\s*-\s*(?:банд|модда)\s/)) && !/хатбоши|қисми|кичик банд/.test(text.slice(0, 60))) return [m[1]];
  if ((m = text.match(/^\(\s*(\d+)\s*[—–-]\s*(\d+)\s*-\s*(?:бандлар|моддалар)/))) return range(+m[1], +m[2]);
  if ((m = text.match(/^\(\s*(\d+)\s*ва\s*(\d+)\s*-\s*(?:бандлар|моддалар)/))) return [m[1], m[2]];
  return null;
}
const range = (a, b) => (b >= a && b - a < 60 ? Array.from({ length: b - a + 1 }, (_, i) => String(a + i)) : null);

const idNum = (n) => String(n).replace(/\^/g, '_').replace(/\./g, '-');

// ───────────────────────── Построение дерева ─────────────────────────

function buildTree(items, act, lang, problems) {
  const inlineArticles = items.some((it) => it.cls === 'ACT_TEXT' && classifyArticle(it.text, lang, true));
  const mode = ARTICLE_KINDS.has(act.kind) && (inlineArticles || items.some((it) => it.cls === 'CLAUSE_DEFAULT' && classifyArticle(it.text, lang))) ? 'articles' : 'points';
  // В изменяющих законах (статьи начинаются прямо в абзаце) заголовки «Статья …» внутри — цитаты,
  // кроме закона в новой редакции, который идёт после пометки «(новая редакция)».
  let quoteClauses = inlineArticles;
  const head = [];
  const tree = [];
  const ids = new Map();

  let container = { id: '', children: tree, tail: null, node: null }; // основной текст или приложение
  let stack = []; // открытые структурные узлы (раздел, глава, §…)
  const levels = new WeakMap();
  let leaf = null; // текущая статья или пункт
  let preamble = null;
  let appendixCount = 0;
  let pendingComment = null; // «см. предыдущую редакцию» относится к следующему абзацу
  let lastBlock = null;
  let started = false; // встретился ли уже текст (после шапки)

  const repealedById = new Map();
  const uniqueId = (base) => {
    const old = repealedById.get(base);
    if (old) {
      // Статья/пункт когда-то утратили силу, а позже под тем же номером введены заново.
      old.list.splice(old.list.indexOf(old.node), 1);
      repealedById.delete(base);
      return base;
    }
    if (!ids.has(base)) {
      ids.set(base, 1);
      return base;
    }
    const n = ids.get(base) + 1;
    ids.set(base, n);
    problems.push(`повтор ID ${base} (#${n})`);
    return `${base}~${n}`;
  };
  const parentChildren = () => (stack.length ? stack.at(-1).children : container.children);
  const prefix = () => (container.id ? container.id + '.' : '');

  function openAppendix(it) {
    appendixCount++;
    const m = it.text.match(/(\d+)\s*-\s*(?:сон\s+)?илова|(?:приложение|ПРИЛОЖЕНИЕ)\s*№?\s*(\d+)/i);
    const num = m ? m[1] ?? m[2] : null; // «ИЛОВА» без номера — основное приложение (Правила, Положение)
    const node = { id: uniqueId(`a${appendixCount}`), type: 'appendix', num, label: it.text, title: '', lexId: it.lexId, children: [] };
    tree.push(node);
    container = { id: node.id, children: node.children, node };
    stack = [];
    leaf = null;
    preamble = null;
  }

  function addBlock(it) {
    // Таблица внутри обычного абзаца — тоже таблица (иначе её нельзя прокрутить внутри блока).
    const kind = /<table/.test(it.html) ? 'table' : BLOCK_KIND[it.cls] ?? 'p';
    if (!it.html) return null;
    const block = { lexId: it.lexId, k: kind, html: it.html };
    if (pendingComment) {
      block.prev = pendingComment;
      pendingComment = null;
    }
    started = true;
    let target = leaf;
    if (!target) {
      const top = stack.at(-1);
      if (top) target = top;
      else {
        if (!preamble) {
          preamble = { id: uniqueId(prefix() + 'pre'), type: 'preamble', num: null, label: '', title: '', lexId: it.lexId, blocks: [] };
          container.children.push(preamble);
        }
        target = preamble;
      }
    }
    (target.blocks ??= []).push(block);
    lastBlock = block;
    return block;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const { cls } = it;
    if (cls === 'INDEXES_ON_REF') continue;

    // Заметки lex.uz
    if (cls === 'CHANGES_ORIGINS') {
      const gone = it.text ? repealedLeaves(it.text, lang) : null;
      if (gone) {
        const letter = mode === 'articles' ? 'm' : 'b';
        for (const num of gone) {
          const id = prefix() + letter + idNum(num);
          if (ids.has(id)) continue;
          const node = { id: uniqueId(id), type: mode === 'articles' ? 'article' : 'point', num, label: '', title: '', lexId: it.lexId, repealed: it.text };
          parentChildren().push(node);
          repealedById.set(node.id, { node, list: parentChildren() });
        }
        leaf = null;
        lastBlock = null;
        continue;
      }
      if (lastBlock && it.text) (lastBlock.changes ??= []).push(it.text);
      continue;
    }
    if (cls === 'COMMENT') {
      if (!it.lexNote) {
        const href = it.html.match(/href="([^"]+)"/)?.[1];
        if (href) pendingComment = href;
        continue;
      }
      if (!it.text || !lastBlock) continue;
      const note = it.text.replace(/^Комментарий LexUz\s*|^LexUz шарҳи\s*/i, '');
      if (/^Неофициальный перевод/.test(note)) {
        lastBlock.unofficial = true;
        (lastBlock.changes ??= []).push(note);
      } else (lastBlock.lexNotes ??= []).push(it.html);
      continue;
    }
    if (cls === 'EXPLANATION') {
      // Справка lex.uz, не текст акта.
      (head.lexNotes ??= []).push(it.html);
      continue;
    }

    // Приложения
    if (cls === 'APPL_BANNER_LANDSCAPE_TITLE' || cls === 'APPL_BANNER_PORTRAIT_TITLE') {
      openAppendix(it);
      continue;
    }
    if (cls === 'ACT_TITLE_APPL') {
      if (!container.node || container.node.children.length) openAppendix({ ...it, text: '' });
      container.node.title = [container.node.title, it.text].filter(Boolean).join(' ');
      (container.node.titleLexIds ??= []).push(it.lexId);
      continue;
    }

    if (cls === 'NEW_EDITION' && mode === 'articles' && inlineArticles) {
      const node = { id: uniqueId('n1'), type: 'newEdition', num: null, label: it.text, title: '', lexId: it.lexId, children: [] };
      tree.push(node);
      container = { id: node.id, children: node.children, node };
      stack = [];
      leaf = null;
      preamble = null;
      quoteClauses = false;
      continue;
    }

    // Шапка, подписи
    if (HEAD_CLASSES.has(cls)) {
      if (cls === 'ACT_FORM' && container.node && !container.node.children.length) {
        container.node.title = [container.node.title, it.text].filter(Boolean).join(' ');
        (container.node.titleLexIds ??= []).push(it.lexId);
      } else if (!started || cls === 'UNOFFIAL' || cls === 'OFFICIAL_SOUR_TEXT' || cls === 'EXTRACT' || cls === 'NEW_EDITION') {
        if (it.text) head.push({ lexId: it.lexId, k: cls.toLowerCase(), html: it.html });
      } else if (it.text) addBlock({ ...it, cls: 'TEXT_CENTER' });
      continue;
    }
    if (SIGN_CLASSES.has(cls)) {
      if (!it.text) continue;
      const owner = container.node ?? null;
      const list = owner ? (owner.sign ??= []) : (head.sign ??= []);
      list.push(it.html);
      continue;
    }

    // Заголовки
    if (cls === 'TEXT_HEADER_DEFAULT') {
      if (!it.text) continue;
      if (/^[«"„]/.test(it.text)) {
        addBlock({ ...it, cls: 'TEXT_CENTER' });
        continue;
      }
      const h = classifyHeading(it.text);
      // В КоАО «Общая/Особенная часть» стоит внутри раздела, в ГК — над разделами.
      const sec = [...stack].reverse().find((n) => n.type === 'section');
      const level = h.type === 'codePart' && sec && sec.children.every((c) => c.type === 'codePart') ? 1.5 : LEVEL[h.type];
      while (stack.length && levels.get(stack.at(-1)) >= level) stack.pop();
      const parentId = stack.length ? stack.at(-1).id : container.id;
      const local = h.type === 'heading' ? `h${(stack.length ? stack.at(-1).children : container.children).filter((n) => n.type === 'heading').length + 1}` : { codePart: 'cp', section: 's', subsection: 'ss', chapter: 'ch', paragraph: 'p' }[h.type] + idNum(h.num);
      const node = { id: uniqueId((parentId ? parentId + '.' : '') + local), type: h.type, num: h.num, label: h.label, title: h.title, lexId: it.lexId, children: [] };
      parentChildren().push(node);
      stack.push(node);
      levels.set(node, level);
      leaf = null;
      started = true;
      continue;
    }

    // Статьи
    if (cls === 'CLAUSE_DEFAULT') {
      const a = mode === 'articles' && !quoteClauses ? classifyArticle(it.text, lang) : null;
      if (!a) {
        if (it.text) addBlock({ ...it, cls: 'TEXT_CENTER' });
        continue;
      }
      leaf = { id: uniqueId(prefix() + 'm' + idNum(a.num)), type: 'article', num: a.num, label: it.text.slice(0, it.text.length - a.title.length).trim(), title: a.title, lexId: it.lexId, blocks: [] };
      parentChildren().push(leaf);
      started = true;
      continue;
    }

    if (!TEXT_CLASSES.has(cls)) {
      problems.push(`неизвестный класс ${cls}`);
      continue;
    }
    if (!it.text && cls !== 'TABLE_STD' && cls !== 'TABLE_STD2') continue;

    // Статья, начинающаяся прямо в абзаце («Статья 2. Часть первую статьи 357 … изложить»)
    if (mode === 'articles' && cls === 'ACT_TEXT') {
      const a = classifyArticle(it.text, lang, true);
      if (a && !(leaf && leaf.num === a.num) && !container.node) {
        leaf = { id: uniqueId(prefix() + 'm' + idNum(a.num)), type: 'article', num: a.num, label: it.text.slice(0, it.text.length - a.title.length).trim(), title: '', lexId: it.lexId, blocks: [], inline: true };
        parentChildren().push(leaf);
      }
    }

    // Пункты подзаконных актов
    if (mode === 'points' && (cls === 'ACT_TEXT' || cls === 'BY_DEFAULT')) {
      const m = it.text.match(POINT_RE);
      if (m) {
        leaf = { id: uniqueId(prefix() + 'b' + idNum(m[1])), type: 'point', num: m[1], label: '', title: '', lexId: it.lexId, blocks: [] };
        parentChildren().push(leaf);
      }
    }
    addBlock(it);
  }
  // Приложение-форма без названия: берём первую строку по центру («ЖУРНАЛ учета…», «ЗАЯВКА…»).
  for (const n of tree) {
    if (n.type !== 'appendix' || n.title) continue;
    const pre = n.children.find((c) => c.type === 'preamble');
    const c = pre?.blocks?.find((b) => b.k === 'center' && plain(b.html).length > 3);
    const bold = pre?.blocks?.[0]?.html.match(/<b>([^<]{4,140})<\/b>/);
    if (c) n.title = plain(c.html).slice(0, 140);
    else if (bold) n.title = plain(bold[1]);
  }
  return { mode, head, tree };
}

// ───────────────────────── Нумерация внутри статьи / пункта ─────────────────────────

/**
 * Проставляет каждому абзацу статьи: часть (part), пункт (item), подпункт (sub), абзац (abz — сквозной номер).
 * Для пункта подзаконного акта: подпункт (sub), абзац/хатбоши (abz).
 * Новая часть начинается, только если предыдущий абзац закончился точкой: диспозиция «…, —» и санкция
 * «влечет …» / «… жазоланади», а также перечисления после двоеточия остаются в той же части.
 */
function annotate(tree, mode) {
  const ENDS = /[.!?](?:["»”)])?\s*$/;
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.children) walk(n.children);
      if (!n.blocks || (n.type !== 'article' && n.type !== 'point')) continue;
      let part = 0;
      let abz = 0;
      let item = null;
      let prevEnded = true;
      n.blocks.forEach((b, idx) => {
        if (b.k !== 'p') return;
        const t = plain(b.html);
        abz++;
        b.abz = abz;
        let m;
        const first = idx === 0 || abz === 1;
        if (mode === 'articles' && (prevEnded || part === 0) && !ITEM_RE.test(t) && !LETTER_RE.test(t)) {
          part++;
          item = null;
        }
        if (!(mode === 'points' && first)) {
          if ((m = t.match(ITEM_RE))) {
            item = m[1];
            b.item = item;
          } else if ((m = t.match(LETTER_RE))) {
            b.sub = m[1];
            if (item) b.item = item;
          } else if (item && !prevEnded) b.item = item;
        }
        if (mode === 'articles') b.part = Math.max(part, 1);
        prevEnded = ENDS.test(t);
      });
    }
  };
  walk(tree);
}

// ───────────────────────── Проверки ─────────────────────────

/** Сверяет нашу нумерацию с примечаниями lex.uz («абзац пятый статьи 3», «1-банднинг иккинчи хатбошиси»). */
function checkAgainstNotes(tree, lang) {
  const res = { checked: 0, agree: 0, mismatches: [] };
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.children) walk(n.children);
      for (const b of n.blocks ?? []) {
        for (const c of b.changes ?? []) {
          let m;
          let want = null;
          let have = null;
          let what = '';
          if (lang === 'ru') {
            if ((m = c.match(/^\(?(?:Неофициальный перевод\.\s*)?[Аа]бзац ([а-яё]+(?: [а-яё]+)?) (?:пункта|статьи) (\d+(?:\^\d+)?)/))) {
              want = ruOrdinal(m[1]);
              have = b.abz;
              what = 'абзац';
            } else if ((m = c.match(/^\(?(?:Неофициальный перевод\.\s*)?[Чч]асть ([а-яё]+(?: [а-яё]+)?) статьи (\d+(?:\^\d+)?)/))) {
              want = ruOrdinal(m[1]);
              have = b.part;
              what = 'часть';
            }
          } else {
            if ((m = c.match(/^\(\s*(\d+(?:\^\d+)?)\s*-\s*(?:банд|модда)нинг ([а-яўқғҳ]+(?: [а-яўқғҳ]+)?) хатбоши/))) {
              want = uzOrdinal(m[2]);
              have = b.abz;
              what = 'хатбоши';
            } else if ((m = c.match(/^\(\s*(\d+(?:\^\d+)?)\s*-\s*модданинг ([а-яўқғҳ]+(?: [а-яўқғҳ]+)?) қисми/))) {
              want = uzOrdinal(m[2]);
              have = b.part;
              what = 'қисм';
            }
          }
          if (want == null || !m) continue;
          if (/исключен|утратил|чиқарилган|ўз кучини йўқотган/.test(c)) continue;
          // Примечание должно относиться к этому же пункту/статье.
          if (String(n.num) !== String(m[lang === 'ru' ? 2 : 1])) continue;
          // «абзацы третий и четвертый» относятся к нескольким абзацам — берём только одиночные.
          if (/абзацы|хатбошилари|части |қисмлари/.test(c.slice(0, 40))) continue;
          res.checked++;
          if (want === have) res.agree++;
          else if (res.mismatches.length < 8) res.mismatches.push(`${n.id}: ${what} ${want} в примечании, у нас ${have}`);
        }
      }
    }
  };
  walk(tree);
  return res;
}

function collect(tree) {
  const out = { nodes: [], byType: {} };
  const walk = (nodes) => {
    for (const n of nodes) {
      out.nodes.push(n);
      out.byType[n.type] = (out.byType[n.type] ?? 0) + 1;
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/** Номера статей / пунктов идут подряд? Возвращает пропуски и нарушения порядка. */
function sequenceGaps(tree) {
  const gaps = [];
  const check = (nodes, scope) => {
    const leaves = nodes.filter((n) => n.type === 'article' || n.type === 'point');
    let prev = null;
    for (const l of leaves) {
      const base = parseInt(l.num, 10);
      const isSub = /[\^.]/.test(l.num);
      if (prev != null && !isSub && base !== prev + 1 && base !== prev) gaps.push(`${scope || 'текст'}: после ${prev} идёт ${l.num}`);
      if (!isSub) prev = base;
    }
  };
  const walk = (nodes, scope, inheritPrev) => {
    // статьи нумеруются сквозь главы; пункты — внутри приложения / основного текста
    const flat = [];
    const own = (n) => n.type === 'appendix' || n.type === 'newEdition';
    const rec = (ns) => ns.forEach((n) => (n.type === 'article' || n.type === 'point' ? flat.push(n) : !own(n) && n.children && rec(n.children)));
    rec(nodes);
    check(flat, scope);
    nodes.filter(own).forEach((a) => walk(a.children, a.id));
  };
  walk(tree, '');
  return gaps;
}

// ───────────────────────── Объём (профильные статьи) ─────────────────────────

function expandScope(list) {
  const set = [];
  for (const r of list) {
    const m = r.match(/^(\d+)-(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) set.push(String(i));
    else set.push(r);
  }
  return set;
}

/** Оставляет только профильные статьи (+ все их «индексные» статьи 175^1 и т. п. внутри диапазона) и путь к ним. */
function applyScope(tree, scope) {
  if (!scope || scope === 'full' || scope.pending) return { tree, missing: [] };
  const core = new Set(expandScope(scope.core));
  const extra = new Set(expandScope(scope.extra ?? []));
  const found = new Set();
  const inRange = (num, set, list) => set.has(num) || list.some((r) => {
    const m = r.match(/^(\d+)-(\d+)$/);
    const base = parseInt(num, 10);
    return m && /\^/.test(num) && base >= +m[1] && base < +m[2];
  });
  const prune = (nodes) =>
    nodes
      .map((n) => {
        if (n.type === 'article') {
          const level = inRange(n.num, core, scope.core) ? 'core' : inRange(n.num, extra, scope.extra ?? []) ? 'extra' : null;
          if (!level) return null;
          found.add(n.num);
          return { ...n, scope: level };
        }
        if (n.type === 'preamble') return null;
        if (!n.children) return null;
        const kids = prune(n.children);
        return kids.length ? { ...n, children: kids } : null;
      })
      .filter(Boolean);
  const out = prune(tree);
  const missing = [...core, ...extra].filter((n) => !found.has(n));
  return { tree: out, missing };
}

// ───────────────────────── gov.uz ─────────────────────────

function parseGovPage(html, lang, pageId, title) {
  const root = parse(html);
  const box = root
    .querySelectorAll('div')
    .filter((e) => e.childNodes.filter((x) => x.nodeType === 1).length <= 3 && e.text.length > 1500 && !/Карта сайта|Sayt xaritasi/.test(e.text))
    .sort((a, b) => a.text.length - b.text.length)[0];
  const blocks = [];
  for (const p of box ? box.querySelectorAll('p,h2,h3,h4,li') : []) {
    if (p.querySelector('p,h2,h3,h4,li')) continue;
    let text = decode(p.text).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (lang === 'uz') text = latnToCyrl(text);
    blocks.push({ k: 'p', html: esc(text) });
  }
  return { id: pageId, type: 'page', num: null, label: '', title, blocks };
}

// ───────────────────────── Основной цикл ─────────────────────────

async function gz(path) {
  return gunzipSync(await readFile(path)).toString('utf8');
}

const report = [];
for (const act of registry.acts) {
  if (only && !only.includes(act.slug)) continue;
  const srcDir = join(ROOT, 'sources', act.slug);
  const outDir = FULL ? join(ROOT, '.dev', 'full', act.slug) : join(ROOT, 'content', act.slug);
  if (!existsSync(join(srcDir, 'meta.json'))) {
    report.push({ slug: act.slug, error: 'нет источника' });
    continue;
  }
  const meta = JSON.parse(await readFile(join(srcDir, 'meta.json'), 'utf8'));
  await mkdir(outDir, { recursive: true });
  const r = { slug: act.slug, langs: {} };

  if (act.source !== 'lex.uz') {
    for (const lang of ['ru', 'uz']) {
      const titles = { nizom: { ru: 'Устав о деятельности Казначейства', uz: 'Ғазначилик фаолияти тўғрисидаги низом' }, vazifalar: { ru: 'Обязанности и функции Казначейства', uz: 'Ғазначиликнинг вазифалари ва функциялари' } };
      const tree = [];
      for (const p of act.pages) {
        const html = await gz(join(srcDir, `${p.id}.${lang}.html.gz`));
        tree.push(parseGovPage(html, lang, p.id, titles[p.id]?.[lang] ?? p.id));
      }
      const doc = {
        slug: act.slug,
        lang,
        source: { site: 'gov.uz', urls: act.pages.map((p) => p[lang]), fetchedAt: meta.fetchedAt, updated: meta.files[`nizom.${lang}`]?.updated ?? null },
        script: lang === 'uz' ? 'translit' : null,
        coverage: 'full',
        mode: 'pages',
        head: [],
        tree,
      };
      await writeFile(join(outDir, `${lang}.json`), JSON.stringify(doc));
      r.langs[lang] = { pages: tree.map((t) => `${t.id}: ${t.blocks.length} абз.`).join(', ') };
    }
    report.push(r);
    continue;
  }

  const parsed = {};
  for (const lang of ['ru', 'uz']) {
    const problems = [];
    const html = await gz(join(srcDir, `${lang}.html.gz`));
    const fm = meta.files[lang];
    const coverage = lang === 'ru' ? meta.ruCoverage : 'full';
    const { items, toc } = elements(html, lang);
    const { mode, head, tree: fullTree } = buildTree(items, act, lang, problems);
    annotate(fullTree, mode);
    const all = collect(fullTree);

    // Сверка с оглавлением lex.uz: каждая статья/глава из оглавления должна быть узлом дерева.
    const nodeLex = new Set(all.nodes.flatMap((n) => [n.lexId, ...(n.titleLexIds ?? [])]));
    const articleLex = new Set(all.nodes.filter((n) => n.type === 'article' && !n.repealed).map((n) => n.lexId));
    const tocArticles = toc.filter((t) => articleLex.has(t.lexId));
    const tocMissing = toc.filter((t) => !nodeLex.has(t.lexId) && !/^[«"„]/.test(t.text));
    const live = (t) => all.nodes.filter((n) => n.type === t && !n.repealed).length;
    const articles = live('article');
    const points = live('point');
    const notes = checkAgainstNotes(fullTree, lang);
    const gaps = sequenceGaps(fullTree);

    const { tree, missing } = FULL ? { tree: fullTree, missing: [] } : applyScope(fullTree, act.scope);
    if (missing.length) problems.push(`в тексте нет статей из объёма: ${missing.join(', ')}`);

    parsed[lang] = { all, tree: fullTree };
    const doc = {
      slug: act.slug,
      lang,
      source: {
        site: 'lex.uz',
        url: fm.url,
        lexId: act.lex[lang],
        edition: fm.edition,
        futureEditions: fm.futureEditions,
        status: fm.status,
        fetchedAt: meta.fetchedAt,
        sha256: fm.sha256,
      },
      script: lang === 'uz' ? (act.uzScript === 'cyrl-lexuz' ? 'cyrl-lexuz' : 'cyrl') : null,
      coverage,
      mode,
      scope: act.scope === 'full' ? 'full' : act.scope.pending ? 'pending' : 'profile',
      head,
      tree: coverage === 'none' ? [] : tree,
    };
    await writeFile(join(outDir, `${lang}.json`), JSON.stringify(doc));
    r.langs[lang] = {
      coverage,
      mode,
      chapters: (all.byType.chapter ?? 0) + (all.byType.section ?? 0) + (all.byType.paragraph ?? 0),
      articles,
      points,
      repealed: all.nodes.filter((n) => n.repealed).length,
      appendices: all.byType.appendix ?? 0,
      tocArticles: tocArticles.length,
      tocMissing: tocMissing.length,
      tocMissingSample: tocMissing.slice(0, 3).map((t) => t.text.slice(0, 60)),
      clauseElements: items.filter((x) => x.cls === 'CLAUSE_DEFAULT').length,
      notes,
      gaps: gaps.slice(0, 6),
      gapCount: gaps.length,
      problems,
    };
  }

  // RU ↔ UZ: одинаковые ID статей и пунктов
  if (parsed.ru && parsed.uz && meta.ruCoverage === 'full') {
    const key = (p, rep = false) => new Set(p.all.nodes.filter((n) => ['article', 'point', 'chapter', 'section', 'paragraph', 'appendix'].includes(n.type) && !!n.repealed === rep).map((n) => n.id));
    const rr = key(parsed.ru, true);
    const ur = key(parsed.uz, true);
    r.repealedOnlyRu = [...rr].filter((x) => !ur.has(x));
    r.repealedOnlyUz = [...ur].filter((x) => !rr.has(x));
    const ru = key(parsed.ru);
    const uz = key(parsed.uz);
    r.onlyRu = [...ru].filter((x) => !uz.has(x));
    r.onlyUz = [...uz].filter((x) => !ru.has(x));
  }
  report.push(r);
}

// ───────────────────────── Отчёт ─────────────────────────

const lines = ['# Отчёт парсера', '', `Собран: ${new Date().toISOString().slice(0, 10)}. Команда: \`npm run parse\`.`, ''];
lines.push('Как читать: парсер сверяет себя с тремя независимыми источниками — (1) оглавлением lex.uz (число статей и что каждый элемент оглавления есть в дереве), (2) русской и узбекской версиями друг с другом (одинаковые ID статей, пунктов, глав), (3) примечаниями lex.uz об изменениях («абзац пятый статьи 3 в редакции…»). Примечания отражают нумерацию на дату изменения, поэтому часть расхождений по ним — историческая (позже вставлялись или исключались абзацы), а не ошибка разбора. Пропуски в нумерации — статьи/пункты, исключённые без отдельной пометки в тексте lex.uz. В изменяющих законах (ЗРУ-1107, ЗРУ-1141) статьи начинаются прямо в абзаце, поэтому в оглавлении lex.uz их нет; в ЗРУ-404 и ЗРУ-445 закон в новой редакции выделен в отдельный блок.', '');
lines.push('Колонки: статьи/пункты — найдено парсером; «оглавл.» — статей в оглавлении lex.uz; «не в дереве» — элементы оглавления lex.uz, которых нет среди узлов; «примечания» — совпадение нашей нумерации частей/абзацев с примечаниями lex.uz; «пропуски» — разрывы в нумерации (часто это утратившие силу статьи/пункты); «RU≠UZ» — узлы, которые есть только в одной версии.', '');
lines.push('| Акт | Яз. | Режим | Глав | Статей | Пунктов | Утратили силу | Прил. | Оглавл. | Не в дереве | Примечания | Пропуски | RU≠UZ | Замечания |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of report) {
  if (r.error) {
    lines.push(`| ${r.slug} | | | | | | | | | | | | | ${r.error} |`);
    continue;
  }
  for (const lang of ['ru', 'uz']) {
    const L = r.langs[lang];
    if (!L) continue;
    if (L.pages) {
      lines.push(`| ${r.slug} | ${lang} | gov.uz | | | | | | | | | | | ${L.pages}${lang === 'uz' ? '; транслитерация' : ''} |`);
      continue;
    }
    if (L.coverage === 'none') {
      lines.push(`| ${r.slug} | ${lang} | — | | | | | | | | | | | русского текста нет |`);
      continue;
    }
    const n = L.notes.checked ? `${L.notes.agree}/${L.notes.checked}` : '—';
    const diff = lang === 'ru' && r.onlyRu ? `${r.onlyRu.length}/${r.onlyUz.length}` : '';
    const prob = [...L.problems, ...(L.coverage === 'partial' ? ['русский текст неполный'] : [])].join('; ');
    lines.push(`| ${r.slug} | ${lang} | ${L.mode} | ${L.chapters} | ${L.articles} | ${L.points} | ${L.repealed} | ${L.appendices} | ${L.tocArticles} | ${L.tocMissing} | ${n} | ${L.gapCount} | ${diff} | ${prob} |`);
  }
}
lines.push('', '## Детали', '');
for (const r of report) {
  const det = [];
  for (const lang of ['ru', 'uz']) {
    const L = r.langs?.[lang];
    if (!L || L.pages || L.coverage === 'none') continue;
    if (L.gaps.length) det.push(`- ${lang}: пропуски нумерации: ${L.gaps.join('; ')}${L.gapCount > L.gaps.length ? ' …' : ''}`);
    if (L.notes.mismatches.length) det.push(`- ${lang}: расхождения с примечаниями: ${L.notes.mismatches.join('; ')}`);
    if (L.tocMissing) det.push(`- ${lang}: нет в дереве: ${L.tocMissingSample.join(' | ')}`);
  }
  if (r.onlyRu?.length || r.onlyUz?.length) det.push(`- только RU: ${r.onlyRu.slice(0, 8).join(', ')}; только UZ: ${r.onlyUz.slice(0, 8).join(', ')}`);
  if (r.repealedOnlyRu?.length || r.repealedOnlyUz?.length) det.push(`- пометки «утратил силу» есть только в одной версии (на действующий текст не влияет): RU ${r.repealedOnlyRu.slice(0, 6).join(', ') || '—'}; UZ ${r.repealedOnlyUz.slice(0, 6).join(', ') || '—'}`);
  if (det.length) lines.push(`**${r.slug}**`, ...det, '');
}
await writeFile(join(ROOT, 'content', 'PARSE_REPORT.md'), lines.join('\n') + '\n');
await writeFile(join(ROOT, 'content', 'parse-report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(`Готово: ${report.length} актов. Отчёт — content/PARSE_REPORT.md`);
