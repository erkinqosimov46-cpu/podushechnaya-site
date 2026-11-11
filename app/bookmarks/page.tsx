'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { actShort, nodeLabel } from '@/lib/format';
import { loadAct, useCatalog } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import { setNote, update, useStore } from '@/lib/store';
import type { Lang, LawNode } from '@/lib/types';

/** Подписи норм для списка: подгружаем акты (из кеша). */
function useLabels(keys: string[], lang: Lang) {
  const [labels, setLabels] = useState<Record<string, { label: string; title: string }>>({});
  const sig = keys.join('|');
  useEffect(() => {
    let alive = true;
    const slugs = [...new Set(keys.map((k) => k.split('/')[0]))];
    Promise.all(
      slugs.map((s) =>
        loadAct(s, lang)
          .then((b) => [s, b] as const)
          .catch(() => null),
      ),
    ).then((list) => {
      if (!alive) return;
      const out: Record<string, { label: string; title: string }> = {};
      for (const k of keys) {
        const [s, ...rest] = k.split('/');
        const id = rest.join('/');
        const b = list.find((x) => x && x[0] === s)?.[1];
        const n: LawNode | undefined = b ? b.curById.get(id) ?? b.uzById.get(id) : undefined;
        if (n) out[k] = { label: nodeLabel(n, lang), title: n.title };
      }
      setLabels(out);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, lang]);
  return labels;
}

export default function BookmarksPage() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<'b' | 'n'>('b');
  const bookmarks = useStore('bookmarks');
  const notes = useStore('notes');
  const { data: catalog } = useCatalog();
  const bkeys = Object.entries(bookmarks)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const nkeys = Object.entries(notes)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([k]) => k);
  const labels = useLabels([...new Set([...bkeys, ...nkeys])], lang);
  const actName = (slug: string) => {
    const a = catalog?.acts.find((x) => x.slug === slug);
    return a ? actShort(a, lang) : slug;
  };
  const href = (k: string) => {
    const [s, ...rest] = k.split('/');
    return `/act/${s}/?n=${encodeURIComponent(rest.join('/'))}`;
  };

  return (
    <>
      <Header title={t.navBookmarks} />
      <main className="space-y-3 px-4 pt-3">
        <div className="flex rounded-full border border-rule bg-sheet p-1 text-[14px] font-medium" role="tablist">
          {(['b', 'n'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`h-10 flex-1 rounded-full ${tab === v ? 'bg-ink text-paper' : 'text-muted'}`}>
              {v === 'b' ? `${t.bookmarks} · ${bkeys.length}` : `${t.notes} · ${nkeys.length}`}
            </button>
          ))}
        </div>

        {tab === 'b' ? (
          bkeys.length ? (
            <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
              {bkeys.map((k) => (
                <li key={k} className="flex items-center">
                  <Link href={href(k)} className="min-w-0 flex-1 px-4 py-2.5 active:bg-rule/30">
                    <div className="text-[12px] font-semibold text-seal">{actName(k.split('/')[0])}</div>
                    <div className="text-[15px] font-medium leading-snug">{labels[k]?.label ?? k}</div>
                    {labels[k]?.title ? <div className="line-clamp-2 text-[13px] text-muted">{labels[k].title}</div> : null}
                  </Link>
                  <button
                    type="button"
                    className="tap px-3 text-muted"
                    aria-label={t.delete}
                    onClick={() =>
                      update((s) => {
                        const b = { ...s.bookmarks };
                        delete b[k];
                        return { bookmarks: b };
                      })
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t.noBookmarks}</p>
          )
        ) : nkeys.length ? (
          <ul className="space-y-2">
            {nkeys.map((k) => (
              <li key={k} className="rounded-xl border border-rule bg-sheet p-3">
                <Link href={href(k)} className="block">
                  <span className="text-[12px] font-semibold text-seal">{actName(k.split('/')[0])}</span>
                  <span className="ml-2 text-[14px] font-medium">{labels[k]?.label ?? k}</span>
                </Link>
                <textarea
                  defaultValue={notes[k].text}
                  onBlur={(e) => setNote(k.split('/')[0], k.split('/').slice(1).join('/'), e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-rule bg-paper p-2 leading-relaxed outline-none focus:border-seal"
                  aria-label={t.note}
                />
                <div className="mt-1 text-right text-[11px] text-muted">{new Date(notes[k].at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-Cyrl-UZ')}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t.noNotes}</p>
        )}
        <div className="h-4" />
      </main>
    </>
  );
}
