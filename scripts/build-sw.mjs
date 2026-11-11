#!/usr/bin/env node
// После `next build` (статический экспорт в out/) пишет out/sw.js — Service Worker:
//  • оболочка приложения (HTML, JS, CSS, шрифты, иконки) кешируется при установке → приложение открывается офлайн;
//  • данные актов (/data/…?v=хеш) кешируются при первом открытии акта (кеш «gazna-data»),
//    кнопка «Скачать всё для офлайна» кладёт в этот же кеш все файлы;
//  • при новой версии данных устаревшие файлы удаляются.

import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'out');

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = (await walk(OUT)).map((p) => '/' + relative(OUT, p).split(sep).join('/'));
const shell = files.filter((f) => !f.startsWith('/data/') && f !== '/sw.js' && !f.endsWith('.txt') && !f.endsWith('.map') && f !== '/404.html');
// Страница каталога хранится как /index.html, остальные — /путь/index.html; запрашиваются как /путь/.
// Квадратные скобки в путях Next ([slug]) браузер запрашивает как %5B…%5D — так и кладём в кеш.
const urls = shell.map((f) => (f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f)).map((u) => u.replace(/\[/g, '%5B').replace(/\]/g, '%5D'));
const manifest = JSON.parse(await readFile(join(OUT, 'data', 'manifest.json'), 'utf8'));
const version = createHash('sha1').update(JSON.stringify([urls, manifest])).digest('hex').slice(0, 10);

const sw = `// Сгенерировано scripts/build-sw.mjs — не править вручную.
const VERSION = ${JSON.stringify(version)};
const SHELL_CACHE = 'gazna-shell-' + VERSION;
const DATA_CACHE = 'gazna-data';
const SHELL = ${JSON.stringify(urls)};
const DATA = ${JSON.stringify(manifest)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (c) => {
      // по одному, чтобы одна ошибка не сорвала всю установку
      for (const u of SHELL) {
        try { await c.add(new Request(u, { cache: 'reload' })); } catch (e) {}
      }
      // каталог, поисковые индексы, глоссарий и план нужны офлайн сразу — без открытия актов
      const d = await caches.open(DATA_CACHE);
      for (const rel of Object.keys(DATA).filter((r) => !r.startsWith('acts/') && !r.startsWith('tests/'))) {
        try { await d.add('/data/' + rel + '?v=' + DATA[rel]); } catch (e) {}
      }
      try { await d.add(new Request('/data/manifest.json', { cache: 'reload' })); } catch (e) {}
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('gazna-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    // удалить устаревшие версии файлов данных
    const c = await caches.open(DATA_CACHE);
    for (const req of await c.keys()) {
      const u = new URL(req.url);
      const rel = u.pathname.replace(/^\\/data\\//, '');
      if (rel === 'manifest.json') continue;
      if (!(rel in DATA) || u.searchParams.get('v') !== DATA[rel]) await c.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/data/')) {
    if (url.pathname === '/data/manifest.json') {
      event.respondWith(fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(DATA_CACHE).then((c) => c.put('/data/manifest.json', copy));
        return res;
      }).catch(() => caches.open(DATA_CACHE).then((c) => c.match('/data/manifest.json')).then((r) => r || Response.error())));
      return;
    }
    // данные актов: из кеша, иначе из сети с сохранением (так открытые акты работают офлайн)
    event.respondWith(caches.open(DATA_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (req.mode === 'navigate') {
    // страницы: сначала сеть, без сети — из кеша (параметры ?n=… не важны)
    event.respondWith(fetch(req).catch(async () => {
      const c = await caches.open(SHELL_CACHE);
      return (await c.match(req, { ignoreSearch: true }))
        || (await c.match(url.pathname.endsWith('/') ? url.pathname : url.pathname + '/', { ignoreSearch: true }))
        || (await c.match('/'));
    }));
    return;
  }

  // статика (_next, шрифты, иконки): из кеша, иначе сеть
  event.respondWith(caches.match(req, { ignoreSearch: url.pathname.startsWith('/_next/') ? false : true }).then((hit) => hit || fetch(req)));
});
`;
await writeFile(join(OUT, 'sw.js'), sw);
console.log(`sw.js: версия ${version}, оболочка ${urls.length} файлов, данных ${Object.keys(manifest).length}`);
