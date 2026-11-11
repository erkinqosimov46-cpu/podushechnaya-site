'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Всё, что пользователь отмечает (закладки, заметки, прогресс, тесты), хранится в localStorage.

type Shape = {
  bookmarks: Record<string, number>; // "акт/узел" → время
  notes: Record<string, { text: string; at: number }>;
  read: Record<string, number>;
  last: { slug: string; node: string | null; at: number; scroll?: number } | null;
  fontSize: number;
  tests: Record<string, { at: number; mode: 'train' | 'exam'; total: number; correct: number; wrong: string[] }[]>;
  answered: Record<string, Record<string, boolean>>; // акт → вопрос → последний ответ верен
};

const DEFAULTS: Shape = { bookmarks: {}, notes: {}, read: {}, last: null, fontSize: 17, tests: {}, answered: {} };
const KEY = 'gazna-store-v1';
const listeners = new Set<() => void>();
let state: Shape | null = null;

function load(): Shape {
  if (state) return state;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    state = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    state = { ...DEFAULTS };
  }
  return state!;
}

function save(next: Shape) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function update(fn: (s: Shape) => Partial<Shape>) {
  const cur = load();
  save({ ...cur, ...fn(cur) });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = null;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
};

/** Подписка на часть хранилища. На сервере (статическая сборка) — значения по умолчанию. */
export function useStore<K extends keyof Shape>(key: K): Shape[K] {
  return useSyncExternalStore(
    subscribe,
    () => load()[key],
    () => DEFAULTS[key],
  );
}

export const normKey = (slug: string, node: string) => `${slug}/${node}`;

export function useBookmark(slug: string, node: string) {
  const bookmarks = useStore('bookmarks');
  const k = normKey(slug, node);
  const on = !!bookmarks[k];
  const toggle = useCallback(
    () =>
      update((s) => {
        const b = { ...s.bookmarks };
        if (b[k]) delete b[k];
        else b[k] = Date.now();
        return { bookmarks: b };
      }),
    [k],
  );
  return [on, toggle] as const;
}

export function useRead(slug: string, node: string) {
  const read = useStore('read');
  const k = normKey(slug, node);
  const on = !!read[k];
  const toggle = useCallback(
    () =>
      update((s) => {
        const r = { ...s.read };
        if (r[k]) delete r[k];
        else r[k] = Date.now();
        return { read: r };
      }),
    [k],
  );
  return [on, toggle] as const;
}

export function setNote(slug: string, node: string, text: string) {
  update((s) => {
    const n = { ...s.notes };
    const k = normKey(slug, node);
    if (text.trim()) n[k] = { text, at: Date.now() };
    else delete n[k];
    return { notes: n };
  });
}

export function setLast(slug: string, node: string | null, scroll?: number) {
  update(() => ({ last: { slug, node, at: Date.now(), scroll } }));
}
