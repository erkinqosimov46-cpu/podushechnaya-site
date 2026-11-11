'use client';

import { useEffect, useState } from 'react';
import type { ActDoc, Catalog, Glossary, IndexRow, Lang, LawNode, Plan, Study, TestBank } from './types';

let manifestPromise: Promise<Record<string, string>> | null = null;
const memo = new Map<string, Promise<unknown>>();

export const DATA_CACHE = 'gazna-data';

/** manifest.json — список файлов данных с хешами; адрес файла получает ?v=хеш. */
export function getManifest(): Promise<Record<string, string>> {
  if (!manifestPromise) {
    manifestPromise = fetch('/data/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(async () => {
        // офлайн: берём из кеша
        const c = await caches.open(DATA_CACHE).catch(() => null);
        const hit = c ? await c.match('/data/manifest.json') : null;
        return hit ? hit.json() : {};
      });
  }
  return manifestPromise;
}

export async function dataUrl(rel: string): Promise<string | null> {
  const m = await getManifest();
  if (!(rel in m)) return null;
  return `/data/${rel}?v=${m[rel]}`;
}

export function loadJson<T>(rel: string): Promise<T | null> {
  if (!memo.has(rel)) {
    memo.set(
      rel,
      (async () => {
        const url = await dataUrl(rel);
        if (!url) return null;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })().catch((e) => {
        memo.delete(rel);
        throw e;
      }),
    );
  }
  return memo.get(rel) as Promise<T | null>;
}

type State<T> = { data: T | null; error: string | null; loading: boolean };

export function useJson<T>(rel: string | null): State<T> {
  const [s, set] = useState<State<T>>({ data: null, error: null, loading: !!rel });
  useEffect(() => {
    if (!rel) return;
    let alive = true;
    set((p) => ({ ...p, loading: true, error: null }));
    loadJson<T>(rel)
      .then((d) => alive && set({ data: d, error: null, loading: false }))
      .catch((e) => alive && set({ data: null, error: String(e?.message ?? e), loading: false }));
    return () => {
      alive = false;
    };
  }, [rel]);
  return s;
}

export const useCatalog = () => useJson<Catalog>('catalog.json');
export const useIndex = (lang: Lang) => useJson<IndexRow[]>(`index.${lang}.json`);
export const useGlossary = () => useJson<Glossary>('glossary.json');
export const usePlan = () => useJson<Plan>('plan.json');
export const useTests = (slug: string | null, lang: Lang) => useJson<TestBank>(slug ? `tests/${slug}.${lang}.json` : null);
export const useStudy = (slug: string | null, lang: Lang) => useJson<Study>(slug ? `acts/${slug}.study.${lang}.json` : null);

export type ActBundle = {
  /** Узбекская (официальная, самая полная) версия — каркас оглавления. */
  uz: ActDoc;
  /** Версия на выбранном языке; для RU может отсутствовать текст. */
  cur: ActDoc;
  uzById: Map<string, LawNode>;
  curById: Map<string, LawNode>;
  parent: Map<string, string | null>;
  /** Статьи / пункты в порядке текста — для «назад / далее». */
  leaves: string[];
};

function indexTree(tree: LawNode[]) {
  const byId = new Map<string, LawNode>();
  const parent = new Map<string, string | null>();
  const leaves: string[] = [];
  const walk = (ns: LawNode[], p: string | null) => {
    for (const n of ns) {
      byId.set(n.id, n);
      parent.set(n.id, p);
      if (n.type === 'article' || n.type === 'point' || n.type === 'page' || (n.type === 'preamble' && n.blocks?.length)) leaves.push(n.id);
      if (n.children) walk(n.children, n.id);
    }
  };
  walk(tree, null);
  return { byId, parent, leaves };
}

const bundles = new Map<string, Promise<ActBundle>>();

export function loadAct(slug: string, lang: Lang): Promise<ActBundle> {
  const key = `${slug}.${lang}`;
  if (!bundles.has(key)) {
    bundles.set(
      key,
      (async () => {
        const uz = await loadJson<ActDoc>(`acts/${slug}.uz.json`);
        if (!uz) throw new Error('not found');
        const cur = lang === 'uz' ? uz : ((await loadJson<ActDoc>(`acts/${slug}.ru.json`)) ?? uz);
        const u = indexTree(uz.tree);
        const c = cur === uz ? u : indexTree(cur.tree);
        return { uz, cur, uzById: u.byId, curById: c.byId, parent: u.parent, leaves: u.leaves };
      })().catch((e) => {
        bundles.delete(key);
        throw e;
      }),
    );
  }
  return bundles.get(key)!;
}

export function useAct(slug: string, lang: Lang) {
  const [s, set] = useState<{ act: ActBundle | null; error: string | null }>({ act: null, error: null });
  useEffect(() => {
    let alive = true;
    set({ act: null, error: null });
    loadAct(slug, lang)
      .then((a) => alive && set({ act: a, error: null }))
      .catch((e) => alive && set({ act: null, error: String(e?.message ?? e) }));
    return () => {
      alive = false;
    };
  }, [slug, lang]);
  return s;
}

/** Какие акты уже сохранены для офлайна (по кешу Service Worker). */
export async function cachedActs(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const c = await caches.open(DATA_CACHE);
    const keys = await c.keys();
    for (const k of keys) {
      const m = new URL(k.url).pathname.match(/^\/data\/acts\/([^.]+)\.uz\.json$/);
      if (m) out.add(m[1]);
    }
  } catch {}
  return out;
}

/** «Скачать всё для офлайна»: кладёт все файлы данных в кеш. */
export async function downloadAll(onProgress: (done: number, total: number) => void): Promise<{ failed: number }> {
  const m = await getManifest();
  const c = await caches.open(DATA_CACHE);
  const rels = Object.keys(m);
  let done = 0;
  let failed = 0;
  onProgress(0, rels.length);
  const queue = [...rels];
  const worker = async () => {
    while (queue.length) {
      const rel = queue.shift()!;
      const url = `/data/${rel}?v=${m[rel]}`;
      try {
        if (!(await c.match(url))) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          await c.put(url, res);
        }
      } catch {
        failed++;
      }
      onProgress(++done, rels.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  try {
    const res = await fetch('/data/manifest.json', { cache: 'no-cache' });
    if (res.ok) await c.put('/data/manifest.json', res);
  } catch {}
  return { failed };
}
