#!/usr/bin/env node
// Собирает ACTS.md — человекочитаемый реестр актов — из content/acts.json и sources/*/meta.json.
//   npm run acts-table

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await readFile(join(ROOT, 'content', 'acts.json'), 'utf8'));

const KIND = {
  konst: 'Конституция',
  kodeks: 'Кодекс (ЗРУ / ЎРҚ)',
  zru: 'ЗРУ / ЎРҚ',
  up: 'УП / ПФ',
  pp: 'ПП / ПҚ',
  pkm: 'ПКМ / ВМҚ',
  mj: 'Ведомственный, рег. МЮ',
  other: 'Иной документ',
};
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (s) => s.replace(/\^(\d+)/g, (_, d) => [...d].map((c) => SUP[c]).join(''));
const dmy = (iso) => (iso ? `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const range = (list) => sup(list.join(', ').replace(/-/g, '–'));

function scopeText(scope) {
  if (scope === 'full') return 'полностью';
  if (scope.pending) return `уточняется: ${scope.pending}`;
  const parts = [`ядро: ${range(scope.core)}`];
  if (scope.extra) parts.push(`доп.: ${range(scope.extra)}`);
  return parts.join('; ');
}

function number(act) {
  if (!act.number) return '—';
  if (act.kind === 'mj') return `рег. № ${act.number}`;
  return /^[А-ЯA-Z]/.test(act.number) ? act.number : `№ ${act.number}`;
}

async function meta(slug) {
  const file = join(ROOT, 'sources', slug, 'meta.json');
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
}

const out = [];
out.push('# Реестр актов', '');
out.push(`Источник: lex.uz (один документ — gov.uz). Дата проверки: **${dmy(registry.checkedAt)}**.`);
out.push('Файл собирается командой `npm run acts-table` из `content/acts.json` и `sources/*/meta.json` — руками не править.', '');
out.push('- **Ред.** — редакция узбекского (официального) текста, которую отдаёт lex.uz; «исх.» — изменений не было.');
out.push('- **Русский текст** — что есть в русской версии на lex.uz. Официальный язык актов — узбекский.');
out.push('- **Объём** — что загружается в приложение: акт полностью или только профильные статьи («ядро» делается первым, «доп.» — после, с пометкой «дополнительно»).');
out.push('- Узбекский текст везде на кириллице. Где оригинал на латинице, кириллица — версия самого lex.uz (помечено).', '');

const noRu = [];
const partialRu = [];
const lagging = [];
let n = 0;
for (const group of registry.groups) {
  out.push(`## ${group.id}. ${group.title.ru}${group.late ? ' — делается последней' : ''}`, '');
  out.push('| № | Вид | Номер | Дата | Название | Ред. | Статус | Русский текст | RU | UZ | Объём | Примечание |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const act of registry.acts.filter((a) => a.group === group.id)) {
    n++;
    const m = await meta(act.slug);
    const notes = [];
    if (act.note?.ru) notes.push(act.note.ru);
    if (act.source !== 'lex.uz') {
      const first = m?.files?.['nizom.ru'];
      const links = act.pages.map((p) => `[${p.id}](${p.ru})`).join(', ');
      const linksUz = act.pages.map((p) => `[${p.id}](${p.uz})`).join(', ');
      out.push(`| ${n} | ${KIND[act.kind]} | — | — | Устав о деятельности Казначейства (Временный устав), задачи и функции | обновлено ${first?.updated?.slice(0, 10) ?? '?'} | — | есть | ${links} | ${linksUz} | полностью | ${notes.join(' ')} |`);
      continue;
    }
    const ru = m?.files.ru;
    const uz = m?.files.uz;
    const title = (ru?.title ?? '').replace(/^(?:\S+-сон )?\d\d\.\d\d\.\d{4}\.\s*/, '') || 'текст не загружен';
    let edition = uz ? (uz.edition ? dmy(uz.edition) : 'исх.') : '—';
    if (uz?.futureEditions.length) edition += ` (буд. ${uz.futureEditions.map(dmy).join(', ')})`;
    const status = uz ? (uz.status ?? 'Действует') : '—';
    let ruText = '—';
    if (m) {
      if (m.ruCoverage === 'none') {
        ruText = '**нет**';
        noRu.push(act);
      } else if (m.ruCoverage === 'partial') {
        ruText = `неполный (${Math.round(m.ruToUzSize * 100)}% объёма)`;
        partialRu.push(act);
      } else ruText = 'есть';
      if (m.ruCoverage !== 'none' && ru.unofficialNotes) ruText += `; ${ru.unofficialNotes} пометок «неофициальный перевод»`;
      if (m.ruCoverage !== 'none' && ru.edition !== uz.edition) {
        ruText += `; ред. ${ru.edition ? dmy(ru.edition) : 'исх.'}`;
        lagging.push({ act, ru: ru.edition, uz: uz.edition });
      }
    }
    if (act.uzScript === 'cyrl-lexuz') notes.push('Узбекский оригинал на латинице, кириллица — версия lex.uz.');
    out.push(
      `| ${n} | ${KIND[act.kind]} | ${number(act)} | ${dmy(act.date)} | ${title} | ${edition} | ${status} | ${ruText} | [${act.lex.ru}](https://lex.uz/ru/docs/${act.lex.ru}) | [${act.lex.uz}](https://lex.uz/docs/${act.lex.uz}) | ${scopeText(act.scope)} | ${notes.join(' ')} |`,
    );
  }
  out.push('');
}

const list = (acts) => acts.map((a) => `${a.kind === 'pkm' ? 'ПКМ ' : ''}${number(a)} (\`${a.slug}\`)`).join(', ');
out.push('## Русские версии на lex.uz', '');
out.push(`- **Русского текста нет** (${noRu.length}): ${list(noRu)}. Страница пишет «Текст акта приводится на узбекском языке» либо даёт только преамбулу приказа.`);
out.push(`- **Русский текст неполный** (${partialRu.length}): ${list(partialRu)}. Как правило, нет приложений.`);
out.push(`- **Редакции RU и UZ различаются** (${lagging.length}): ${lagging.map((l) => `${number(l.act)} \`${l.act.slug}\` — RU ${dmy(l.ru)}, UZ ${dmy(l.uz)}`).join('; ')}.`);
out.push('- В остальных актах русский текст есть, но отдельные нормы lex.uz сам помечает как «Неофициальный перевод» — число пометок указано в таблице.', '');

await writeFile(join(ROOT, 'ACTS.md'), out.join('\n'));
console.log(`ACTS.md: ${n} записей; без русского текста — ${noRu.length}, неполный — ${partialRu.length}, расхождение редакций — ${lagging.length}`);
