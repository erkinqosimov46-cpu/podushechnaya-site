'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KindStamp } from '@/components/ActCard';
import { Header } from '@/components/Header';
import { IconNext } from '@/components/Icons';
import { actShort, nodeLabel, norm, parseNumberQuery, plainHtml, supText } from '@/lib/format';
import { loadAct, useCatalog, useIndex } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import type { CatalogAct, IndexRow, LawNode } from '@/lib/types';

type Hit = { slug: string; id: string; type: string; num: string; title: string; snippet: string };

function snippetAround(text: string, words: string[]): string {
  const low = norm(text);
  let at = -1;
  for (const w of words) {
    at = low.indexOf(w);
    if (at >= 0) break;
  }
  if (at < 0) return text.slice(0, 160);
  const s = Math.max(0, at - 60);
  return (s ? '…' : '') + text.slice(s, s + 180) + (s + 180 < text.length ? '…' : '');
}

function Mark({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export function SearchView() {
  const { t, lang } = useLang();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const actFilter = params.get('act');
  const { data: catalog } = useCatalog();
  const { data: index } = useIndex(lang);
  const [full, setFull] = useState<{ running: boolean; done: number; total: number; hits: Hit[] } | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => {
      const url = q ? `/search/?q=${encodeURIComponent(q)}${actFilter ? `&act=${actFilter}` : ''}` : '/search/';
      router.replace(url, { scroll: false });
    }, 300);
    setFull(null);
    runId.current++;
    return () => clearTimeout(id);
  }, [q, actFilter, router]);

  const byslug = useMemo(() => new Map((catalog?.acts ?? []).map((a) => [a.slug, a])), [catalog]);
  const words = useMemo(() => norm(q).split(/\s+/).filter((w) => w.length >= 2), [q]);

  const result = useMemo(() => {
    if (!q.trim() || !index || !catalog) return null;
    const rows = actFilter ? index.filter((r) => r[0] === actFilter) : index;
    const num = parseNumberQuery(q);
    let acts: CatalogAct[] = [];
    let norms: IndexRow[] = [];
    if (num) {
      const base = num.num.replace(/\^.*/, '');
      acts = catalog.acts.filter((a) => a.number.replace(/^[^\d]*/, '').split('-')[0] === base || a.number === num.num);
      norms = rows.filter((r) => r[3] === num.num && (num.type === 'any' ? r[2] === 'article' || r[2] === 'point' : r[2] === num.type));
    } else if (words.length) {
      acts = catalog.acts.filter((a) => words.every((w) => norm(`${a.title.ru} ${a.title.uz} ${a.number}`).includes(w)));
      norms = rows.filter((r) => {
        const hay = norm(`${r[4]} ${r[5]}`);
        return words.every((w) => hay.includes(w));
      });
    }
    return { acts, norms: norms.slice(0, 150), more: norms.length > 150 };
  }, [q, index, catalog, words, actFilter]);

  async function runFull() {
    if (!catalog) return;
    const my = ++runId.current;
    const acts = actFilter ? catalog.acts.filter((a) => a.slug === actFilter) : catalog.acts;
    const hits: Hit[] = [];
    setFull({ running: true, done: 0, total: acts.length, hits: [] });
    for (let i = 0; i < acts.length; i++) {
      if (runId.current !== my) return;
      try {
        const b = await loadAct(acts[i].slug, lang);
        const doc = lang === 'ru' && b.cur.coverage === 'none' ? b.uz : b.cur;
        const walk = (ns: LawNode[]) => {
          for (const n of ns) {
            if (n.blocks?.length) {
              const text = n.blocks.map((x) => plainHtml(x.html)).join(' ');
              const low = norm(text);
              if (words.every((w) => low.includes(w))) hits.push({ slug: acts[i].slug, id: n.id, type: n.type, num: n.num ?? '', title: n.title, snippet: snippetAround(text, words) });
            }
            if (n.children) walk(n.children);
          }
        };
        walk(doc.tree);
      } catch {}
      if (runId.current !== my) return;
      setFull({ running: i < acts.length - 1, done: i + 1, total: acts.length, hits: [...hits].slice(0, 300) });
    }
  }

  const rowLabel = (slug: string, type: string, num: string, title: string) => {
    const fake = { id: '', type, num, label: title, title } as LawNode;
    const l = type === 'article' || type === 'point' ? nodeLabel(fake, lang) : supText(title);
    return l;
  };

  const actName = (slug: string) => {
    const a = byslug.get(slug);
    return a ? actShort(a, lang) : slug;
  };

  return (
    <>
      <Header title={t.navSearch} />
      <main className="space-y-4 px-4 pt-3">
        <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-10 -mx-4 bg-paper/95 px-4 pb-2 pt-1 backdrop-blur">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
            inputMode="search"
            enterKeyHint="search"
            className="h-12 w-full rounded-xl border border-rule bg-sheet px-4 outline-none focus:border-seal"
            aria-label={t.navSearch}
          />
          {actFilter ? (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className="rounded-full bg-seal/15 px-3 py-1 text-seal">{actName(actFilter)}</span>
              <Link href={`/search/?q=${encodeURIComponent(q)}`} className="text-muted underline">
                ✕
              </Link>
            </div>
          ) : null}
        </div>

        {!q.trim() ? (
          <div className="space-y-3">
            <p className="text-[14px] text-muted">{t.searchHint}</p>
            <div className="flex flex-wrap gap-2">
              {(lang === 'ru' ? ['ст. 357', '45-банд', '2850', 'казначейство', 'смета'] : ['357-модда', '45-банд', '2850', 'ғазначилик', 'смета']).map((s) => (
                <button key={s} type="button" onClick={() => setQ(s)} className="h-10 rounded-full border border-rule bg-sheet px-4 text-[14px]">
                  {s}
                </button>
              ))}
            </div>
            <Link href="/glossary/" className="flex min-h-[52px] items-center gap-3 rounded-xl border border-rule bg-sheet px-4 active:bg-rule/30">
              <span className="flex-1 text-[15px] font-medium">{t.glossary}</span>
              <IconNext width={18} height={18} className="text-muted" />
            </Link>
          </div>
        ) : null}

        {result?.acts.length ? (
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.searchActs}</h2>
            <ul className="space-y-2">
              {result.acts.map((a) => (
                <li key={a.slug}>
                  <Link href={`/act/${a.slug}/`} className="block rounded-xl border border-rule bg-sheet px-4 py-3 active:bg-rule/30">
                    <KindStamp act={a} />
                    <div className="mt-1 line-clamp-2 text-[15px] font-medium">{a.title[lang]}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {result ? (
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.searchNorms}</h2>
            {result.norms.length ? (
              <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
                {result.norms.map((r) => (
                  <li key={`${r[0]}/${r[1]}`}>
                    <Link href={`/act/${r[0]}/?n=${encodeURIComponent(r[1])}${words.length && !parseNumberQuery(q) ? `&q=${encodeURIComponent(q)}` : ''}`} className="block px-4 py-2.5 active:bg-rule/30">
                      <div className="text-[12px] font-semibold text-seal">
                        {actName(r[0])} · {rowLabel(r[0], r[2], r[3], r[4])}
                      </div>
                      {r[4] && (r[2] === 'article' || r[2] === 'point') ? <div className="text-[14px] font-medium leading-snug"><Mark text={supText(r[4])} words={words} /></div> : null}
                      {r[5] ? <div className="line-clamp-2 text-[13px] leading-snug text-muted"><Mark text={r[5]} words={words} /></div> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : !result.acts.length ? (
              <p className="text-muted">{t.searchNothing}</p>
            ) : null}
          </section>
        ) : null}

        {q.trim() && !parseNumberQuery(q) && words.length ? (
          <section className="space-y-2 pb-4">
            {!full ? (
              <button type="button" onClick={runFull} className="h-12 w-full rounded-xl border border-ink text-[15px] font-semibold">
                {t.searchFull}
              </button>
            ) : (
              <>
                <p className="text-[13px] text-muted">{full.running ? t.searchFullRunning(full.done, full.total) : `${full.hits.length}`}</p>
                <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
                  {full.hits.map((h) => (
                    <li key={`${h.slug}/${h.id}`}>
                      <Link href={`/act/${h.slug}/?n=${encodeURIComponent(h.id)}&q=${encodeURIComponent(q)}`} className="block px-4 py-2.5 active:bg-rule/30">
                        <div className="text-[12px] font-semibold text-seal">
                          {actName(h.slug)} · {rowLabel(h.slug, h.type, h.num, h.title)}
                        </div>
                        <div className="line-clamp-3 font-law text-[14px] leading-snug">
                          <Mark text={h.snippet} words={words} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                {!full.running && !full.hits.length ? <p className="text-muted">{t.searchNothing}</p> : null}
              </>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
