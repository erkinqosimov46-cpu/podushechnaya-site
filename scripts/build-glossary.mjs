#!/usr/bin/env node
// Глоссарий RU ↔ UZ: термины берутся только из официальных текстов.
// 1) Статьи/пункты «Основные понятия»: определения начинаются с выделенного термина
//    («<b>бюджетный процесс</b> — …»); пара RU ↔ UZ — это абзац с тем же номером в той же норме.
// 2) Сокращения, введённые в текстах актов: «(далее — ЕКС)» / «(бундан буён матнда ЯҒҲ деб юритилади)».
// 3) Сокращения видов актов — постоянный список (как на lex.uz).
// Результат — content/glossary.json (можно править руками; при повторном запуске перезаписывается).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const registry = await read(join(ROOT, 'content', 'acts.json'));

const terms = [];
const seen = new Set();
const abbrs = [];

function nodes(tree) {
  const out = [];
  const walk = (ns) => ns.forEach((n) => (out.push(n), n.children && walk(n.children)));
  walk(tree);
  return out;
}

for (const act of registry.acts) {
  if (act.source !== 'lex.uz') continue;
  const ru = await read(join(ROOT, 'content', act.slug, 'ru.json'));
  const uz = await read(join(ROOT, 'content', act.slug, 'uz.json'));
  const uzNodes = new Map(nodes(uz.tree).map((n) => [n.id, n]));

  // Сокращения, введённые в тексте
  for (const [doc, lang] of [[ru, 'ru'], [uz, 'uz']]) {
    if (doc.coverage === 'none') continue;
    for (const n of nodes(doc.tree)) {
      for (const b of n.blocks ?? []) {
        const t = plain(b.html);
        const re = lang === 'ru' ? /\(далее(?: по тексту)?\s*[—–-]\s*([^()]{2,40}?)\)/g : /\(бундан буён(?: матнда)?\s+([^()]{2,40}?)\s+деб юритилади\)/g;
        for (const m of t.matchAll(re)) {
          const abbr = m[1].replace(/[«»"]/g, '').trim();
          if (!/[А-ЯЁЎҚҒҲA-Z]{2,}/.test(abbr) || abbr.length > 25) continue;
          const key = `${lang}|${abbr}`;
          if (seen.has(key)) continue;
          seen.add(key);
          abbrs.push({ lang, abbr, context: t.slice(Math.max(0, m.index - 110), m.index + m[0].length), ref: { act: act.slug, node: n.id } });
        }
      }
    }
  }

  // Определения: только если русский текст полный
  if (ru.coverage !== 'full') continue;
  for (const rn of nodes(ru.tree)) {
    const un = uzNodes.get(rn.id);
    if (!un?.blocks || !rn.blocks) continue;
    const rb = rn.blocks.filter((b) => b.k === 'p');
    const ub = un.blocks.filter((b) => b.k === 'p');
    if (rb.length !== ub.length) continue;
    const isDef = (b) => /^<b>[^<]{2,90}<\/b>\s*[—–-]/.test(b.html);
    if (rb.filter(isDef).length < 3) continue;
    rb.forEach((b, i) => {
      if (!isDef(b) || !isDef(ub[i])) return;
      const termRu = b.html.match(/^<b>([^<]+)<\/b>/)[1].trim();
      const termUz = ub[i].html.match(/^<b>([^<]+)<\/b>/)[1].trim();
      const key = termRu.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      terms.push({
        ru: termRu,
        uz: termUz,
        defRu: plain(b.html).replace(/^[^—–-]+[—–-]\s*/, ''),
        defUz: plain(ub[i].html).replace(/^[^—–-]+[—–-]\s*/, ''),
        ref: { act: act.slug, node: rn.id, abz: b.abz ?? i + 1 },
      });
    });
  }
}

terms.sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
const actTypes = [
  { ru: 'ЗРУ', uz: 'ЎРҚ', fullRu: 'Закон Республики Узбекистан', fullUz: 'Ўзбекистон Республикасининг Қонуни' },
  { ru: 'УП', uz: 'ПФ', fullRu: 'Указ Президента Республики Узбекистан', fullUz: 'Ўзбекистон Республикаси Президентининг Фармони' },
  { ru: 'ПП', uz: 'ПҚ', fullRu: 'Постановление Президента Республики Узбекистан', fullUz: 'Ўзбекистон Республикаси Президентининг қарори' },
  { ru: 'ПКМ', uz: 'ВМҚ', fullRu: 'Постановление Кабинета Министров Республики Узбекистан', fullUz: 'Ўзбекистон Республикаси Вазирлар Маҳкамасининг қарори' },
  { ru: 'рег. № МЮ', uz: 'АВ рўйхат рақами', fullRu: 'Ведомственный акт, зарегистрированный Министерством юстиции (регистрационный номер)', fullUz: 'Адлия вазирлиги томонидан давлат рўйхатидан ўтказилган идоравий ҳужжат (рўйхат рақами)' },
];
await writeFile(join(ROOT, 'content', 'glossary.json'), JSON.stringify({ terms, abbreviations: abbrs, actTypes }, null, 1) + '\n');
console.log(`glossary: терминов ${terms.length}, сокращений из текстов ${abbrs.length}`);
