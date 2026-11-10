#!/usr/bin/env node
// Скачивает официальные тексты актов (RU + UZ) в /sources по реестру content/acts.json.
//
//   npm run fetch-sources                 — скачать всё, чего ещё нет
//   npm run fetch-sources -- --force      — перекачать всё заново
//   npm run fetch-sources -- --only bk,mj-2850
//   npm run fetch-sources -- --import     — взять вручную сохранённые sources/{акт}/ru.html и uz.html
//
// Официальный текст берётся только как есть: скрипт ничего не переводит и не правит.
// Файлы хранятся сжатыми (ru.html.gz / uz.html.gz), рядом — meta.json с редакцией и контрольной суммой.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'sources');
const REGISTRY = join(ROOT, 'content', 'acts.json');
const UA = 'Mozilla/5.0 (compatible; legislation-reference-fetcher)';
const LANGS = ['ru', 'uz'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const FORCE = flag('force');
const IMPORT = flag('import');
const CONCURRENCY = Number(opt('concurrency') ?? 3);

const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const dmyToIso = (d) => `${d.slice(6)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;

/** Адрес страницы акта на lex.uz. Русская версия — /ru/docs/{id}, узбекская — /docs/{id}. */
export function lexUrl(lang, id) {
  return lang === 'ru' ? `https://lex.uz/ru/docs/${id}` : `https://lex.uz/docs/${id}`;
}

async function download(url, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 2000) throw new Error(`слишком короткий ответ (${text.length} байт)`);
      return text;
    } catch (e) {
      lastError = e;
      await sleep(2000 * 2 ** i);
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

const stripTags = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Доля кириллических букв среди всех букв — чтобы отличить кириллицу от латиницы. */
function cyrillicShare(text) {
  const cyr = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  return cyr + lat === 0 ? 0 : cyr / (cyr + lat);
}

/** Тело документа на странице lex.uz (без шапки сайта и подвала). */
function lexBody(html) {
  const start = html.indexOf('id="divCont"');
  if (start < 0) return '';
  const end = html.indexOf('<footer', start);
  return html.slice(start, end > 0 ? end : undefined);
}

function lexMeta(html, lang) {
  const body = lexBody(html);
  const title = stripTags(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
  const dates = new Set();
  for (const m of html.matchAll(/ONDATE2?=(\d\d\.\d\d\.\d{4})/g)) dates.add(dmyToIso(m[1]));
  const editions = [...dates].sort();
  const selected = [...html.matchAll(/lx_date_selected[^>]*>\s*(\d\d\.\d\d\.\d{4})/g)].map((m) => dmyToIso(m[1]));
  const warning = [...html.matchAll(/class="[^"]*act_warning[^"]*"[^>]*>([\s\S]*?)<\//g)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean)[0];
  const nextVersion = stripTags(html.match(/class="lx_next_ver"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '');
  const counterpart = {};
  for (const m of html.matchAll(/openUrl\('\/(?:ru\/)?docs\/(-?\d+)'\)"\s*title="([^"]+)"/g)) {
    if (m[2] === 'На русском') counterpart.ru = Number(m[1]);
    if (m[2] === 'Ўзбекча') counterpart.uzCyrl = Number(m[1]);
    if (m[2] === "O'zbekcha") counterpart.uzLatn = Number(m[1]);
  }
  const count = (cls) => (body.match(new RegExp(`class="${cls}`, 'g')) ?? []).length;
  const bodyText = stripTags(body);
  return {
    lang,
    title,
    // Редакция, которую показывает страница. null — у акта нет изменений (исходная редакция).
    edition: selected.at(-1) ?? null,
    editions,
    futureEditions: editions.filter((d) => d > today()),
    nextVersion: nextVersion || null,
    status: warning ?? null, // null — предупреждений нет, акт действует
    counterpart,
    counts: {
      headers: count('TEXT_HEADER_DEFAULT'),
      clauses: count('CLAUSE_DEFAULT'),
      paragraphs: count('ACT_TEXT'),
      chars: bodyText.length,
    },
    cyrillicShare: Number(cyrillicShare(bodyText).toFixed(3)),
    // Сколько норм lex.uz сам пометил как «Неофициальный перевод» (бывает в русских версиях).
    unofficialNotes: (bodyText.match(/Неофициальный перевод/g) ?? []).length,
    sha256: sha256(bodyText),
  };
}

function pageMeta(html, lang) {
  const text = stripTags(html);
  return {
    lang,
    title: stripTags(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
    counts: { chars: text.length },
    cyrillicShare: Number(cyrillicShare(text).toFixed(3)),
    updated: text.match(/(?:Последнее обновление|Oxirgi yangilani\S+):\s*([\d-]+ [\d:]+)/)?.[1] ?? null,
    sha256: sha256(text),
  };
}

async function readStored(dir, name) {
  const gz = join(dir, `${name}.html.gz`);
  if (existsSync(gz)) return gunzipSync(await readFile(gz)).toString('utf8');
  return null;
}

async function store(dir, name, html) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.html.gz`), gzipSync(Buffer.from(html, 'utf8'), { level: 9 }));
}

/** Возвращает HTML: из ручного файла (--import), из уже скачанного или из сети. */
async function obtain(dir, name, url) {
  const manual = join(dir, `${name}.html`);
  if (IMPORT && existsSync(manual)) {
    const html = await readFile(manual, 'utf8');
    await store(dir, name, html);
    await rm(manual);
    return { html, origin: 'import' };
  }
  if (!FORCE) {
    const stored = await readStored(dir, name);
    if (stored) return { html: stored, origin: 'cache' };
  }
  if (IMPORT) throw new Error(`нет файла ${manual}`);
  const html = await download(url);
  await store(dir, name, html);
  return { html, origin: 'network' };
}

async function processLexAct(act) {
  const dir = join(SOURCES, act.slug);
  const meta = { slug: act.slug, source: 'lex.uz', fetchedAt: today(), files: {}, problems: [] };
  for (const lang of LANGS) {
    const url = lexUrl(lang, act.lex[lang]);
    const { html, origin } = await obtain(dir, lang, url);
    const m = lexMeta(html, lang);
    meta.files[lang] = { url, origin, ...m };
  }
  const { ru, uz } = meta.files;
  // Полнота русской версии. Официальный язык актов — узбекский; русского текста на lex.uz
  // может не быть совсем («Текст акта приводится на узбекском языке») или не быть у приложений.
  const ratio = uz.counts.chars ? ru.counts.chars / uz.counts.chars : 0;
  meta.ruCoverage = ru.counts.paragraphs <= 5 && uz.counts.paragraphs > 10 ? 'none' : ratio < 0.75 ? 'partial' : 'full';
  meta.ruToUzSize = Number(ratio.toFixed(2));
  if (!uz.counts.paragraphs) meta.problems.push('uz: текст акта не найден на странице');
  if (uz.status) meta.problems.push(`статус: ${uz.status}`);
  // Сверка языковой пары: страницы должны ссылаться друг на друга.
  if (ru.counterpart.uzCyrl !== act.lex.uz) meta.problems.push(`ru-страница ссылается на uz ${ru.counterpart.uzCyrl}, в реестре ${act.lex.uz}`);
  if (uz.counterpart.ru !== act.lex.ru) meta.problems.push(`uz-страница ссылается на ru ${uz.counterpart.ru}, в реестре ${act.lex.ru}`);
  if (uz.cyrillicShare < 0.9) meta.problems.push(`uz: текст не на кириллице (доля ${uz.cyrillicShare})`);
  if (ru.edition !== uz.edition) meta.problems.push(`редакции различаются: ru ${ru.edition}, uz ${uz.edition}`);
  if (meta.ruCoverage === 'full') {
    for (const key of ['headers', 'clauses']) {
      if (ru.counts[key] !== uz.counts[key]) meta.problems.push(`${key}: ru ${ru.counts[key]}, uz ${uz.counts[key]}`);
    }
  }
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
  return meta;
}

async function processPagesAct(act) {
  const dir = join(SOURCES, act.slug);
  const meta = { slug: act.slug, source: act.source, fetchedAt: today(), files: {}, problems: [] };
  for (const page of act.pages) {
    for (const lang of LANGS) {
      const name = `${page.id}.${lang}`;
      const { html, origin } = await obtain(dir, name, page[lang]);
      meta.files[name] = { url: page[lang], origin, ...pageMeta(html, lang) };
    }
  }
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
  return meta;
}

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY, 'utf8'));
  const acts = registry.acts.filter((a) => !only || only.includes(a.slug));
  if (only) for (const s of only) if (!acts.some((a) => a.slug === s)) console.warn(`! нет акта «${s}» в реестре`);

  const results = [];
  const failed = [];
  let next = 0;
  async function worker() {
    while (next < acts.length) {
      const act = acts[next++];
      try {
        const meta = act.source === 'lex.uz' ? await processLexAct(act) : await processPagesAct(act);
        results.push(meta);
        const origins = Object.values(meta.files).map((f) => f.origin);
        const mark = meta.problems.length ? '!' : '✓';
        const ruNote = meta.ruCoverage === 'none' ? '  [русского текста нет]' : meta.ruCoverage === 'partial' ? '  [русский текст неполный]' : '';
        console.log(`${mark} ${act.slug.padEnd(12)} ${origins.join('/')}${ruNote}${meta.problems.length ? '  — ' + meta.problems.join('; ') : ''}`);
        if (origins.includes('network')) await sleep(400);
      } catch (e) {
        failed.push({ slug: act.slug, error: e.message });
        console.log(`✗ ${act.slug.padEnd(12)} ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, acts.length) }, worker));

  // Сводка по всем актам, которые уже лежат в /sources.
  const index = [];
  for (const act of registry.acts) {
    const file = join(SOURCES, act.slug, 'meta.json');
    if (!existsSync(file)) continue;
    const meta = JSON.parse(await readFile(file, 'utf8'));
    const ru = meta.files.ru;
    index.push({
      slug: act.slug,
      source: meta.source,
      fetchedAt: meta.fetchedAt,
      edition: ru ? ru.edition : null,
      futureEditions: ru ? ru.futureEditions : [],
      editionUz: meta.files.uz ? meta.files.uz.edition : null,
      status: meta.files.uz ? meta.files.uz.status : null,
      ruCoverage: meta.ruCoverage ?? null,
      ruUnofficialNotes: ru ? ru.unofficialNotes : null,
      problems: meta.problems,
    });
  }
  await mkdir(SOURCES, { recursive: true });
  await writeFile(join(SOURCES, 'index.json'), JSON.stringify(index, null, 1) + '\n');

  console.log(`\nГотово: ${results.length} из ${acts.length}. С замечаниями: ${results.filter((r) => r.problems.length).length}. Ошибок загрузки: ${failed.length}.`);
  if (failed.length) {
    console.log('\nНе удалось скачать. Сохраните страницы вручную (Ctrl+S → «Веб-страница, только HTML») и запустите: npm run fetch-sources -- --import');
    for (const f of failed) {
      const act = registry.acts.find((a) => a.slug === f.slug);
      if (act.source === 'lex.uz') {
        for (const lang of LANGS) console.log(`  ${lexUrl(lang, act.lex[lang])}  →  sources/${act.slug}/${lang}.html`);
      } else {
        for (const p of act.pages) for (const lang of LANGS) console.log(`  ${p[lang]}  →  sources/${act.slug}/${p.id}.${lang}.html`);
      }
    }
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
