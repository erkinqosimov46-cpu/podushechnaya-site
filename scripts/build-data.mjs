#!/usr/bin/env node
// Готовит данные для приложения: content/ → public/data/
//   public/data/catalog.json            — список актов (вид, номер, дата, названия RU/UZ, редакции, статус, ссылки)
//   public/data/acts/{акт}.{ru|uz}.json — текст акта (как в content/, без служебных полей парсера)
//   public/data/index.{ru|uz}.json      — индекс для поиска по номеру и заголовкам
//   public/data/glossary.json, plan.json, tests/…
//   public/data/manifest.json           — список файлов с хешами (для офлайна и обновлений)
// Запускается автоматически перед сборкой (npm run build).

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const plain = (html) =>
  html
    .replace(/<sup>\s*([^<]*?)\s*<\/sup>/g, '^$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
const stripTitle = (t) => t.replace(/^(?:\S+-сон )?\d\d\.\d\d\.\d{4}\.\s*/, '').trim();

const registry = await read(join(ROOT, 'content', 'acts.json'));
await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'acts'), { recursive: true });
await mkdir(join(OUT, 'tests'), { recursive: true });

const manifest = {};
async function emit(rel, data) {
  const text = JSON.stringify(data);
  await writeFile(join(OUT, rel), text);
  manifest[rel] = createHash('sha1').update(text).digest('hex').slice(0, 10);
}

/** Убираем поля, нужные только для проверки парсера. */
function slim(nodes) {
  return nodes.map((n) => {
    const { titleLexIds, inline, ...rest } = n;
    if (rest.children) rest.children = slim(rest.children);
    return rest;
  });
}

const catalog = [];
const index = { ru: [], uz: [] };
for (const act of registry.acts) {
  const dir = join(ROOT, 'content', act.slug);
  if (!existsSync(join(dir, 'uz.json'))) continue;
  const meta = existsSync(join(ROOT, 'sources', act.slug, 'meta.json')) ? await read(join(ROOT, 'sources', act.slug, 'meta.json')) : null;
  const docs = {};
  for (const lang of ['ru', 'uz']) {
    const doc = await read(join(dir, `${lang}.json`));
    doc.tree = slim(doc.tree);
    docs[lang] = doc;
    await emit(`acts/${act.slug}.${lang}.json`, doc);
  }
  // Учебный слой и тесты (Этап 5) — если уже есть.
  const tests = {};
  for (const lang of ['ru', 'uz']) {
    const f = join(dir, `tests.${lang}.json`);
    if (existsSync(f)) {
      const t = await read(f);
      tests[lang] = t.questions?.length ?? 0;
      await emit(`tests/${act.slug}.${lang}.json`, t);
    }
    const s = join(dir, `study.${lang}.json`);
    if (existsSync(s)) await emit(`acts/${act.slug}.study.${lang}.json`, await read(s));
  }

  let titles;
  if (act.source === 'lex.uz') {
    titles = { ru: stripTitle(meta.files.ru.title), uz: stripTitle(meta.files.uz.title) };
  } else {
    titles = { ru: 'Устав о деятельности Казначейства (Временный устав)', uz: 'Ғазначилик фаолияти тўғрисидаги низом (вақтинчалик)' };
  }
  // Количество «листьев» (статей/пунктов) — для прогресса.
  let leaves = 0;
  const walkCount = (ns) => ns.forEach((n) => ((n.type === 'article' || n.type === 'point') && !n.repealed ? leaves++ : n.children && walkCount(n.children)));
  walkCount(docs.uz.tree);
  if (act.source !== 'lex.uz') leaves = docs.uz.tree.length;

  catalog.push({
    slug: act.slug,
    group: act.group,
    kind: act.kind,
    number: act.number,
    date: act.date,
    title: titles,
    source: act.source,
    lex: act.lex ?? null,
    pages: act.pages ?? null,
    edition: { ru: docs.ru.source?.edition ?? null, uz: docs.uz.source?.edition ?? null },
    futureEditions: docs.uz.source?.futureEditions ?? [],
    status: docs.uz.source?.status ?? null,
    fetchedAt: docs.uz.source?.fetchedAt ?? null,
    coverageRu: docs.ru.coverage,
    uzScript: docs.uz.script,
    scope: docs.uz.scope ?? 'full',
    note: act.note ?? null,
    leaves,
    tests,
  });

  // Поисковый индекс: [акт, id, тип, номер, заголовок, начало текста]
  for (const lang of ['ru', 'uz']) {
    const src = lang === 'ru' && docs.ru.coverage === 'none' ? docs.uz : docs[lang];
    const walk = (ns) => {
      for (const n of ns) {
        if (n.type !== 'preamble') {
          const first = n.blocks?.find((b) => b.k === 'p');
          index[lang].push([act.slug, n.id, n.type, n.num ?? '', n.title || (n.type === 'appendix' ? n.label : ''), first ? plain(first.html).slice(0, 140) : '']);
        }
        if (n.children) walk(n.children);
      }
    };
    walk(src.tree);
  }
}

await emit('catalog.json', { checkedAt: registry.checkedAt, groups: registry.groups, acts: catalog });
await emit('index.ru.json', index.ru);
await emit('index.uz.json', index.uz);
for (const f of ['glossary.json', 'plan.json']) {
  const p = join(ROOT, 'content', f);
  if (existsSync(p)) await emit(f, await read(p));
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));
const size = Object.keys(manifest).length;
console.log(`public/data: ${size} файлов, актов ${catalog.length}`);
