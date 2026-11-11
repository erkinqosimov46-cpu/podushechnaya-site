'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { actShort, norm } from '@/lib/format';
import { useCatalog, useGlossary } from '@/lib/data';
import { useLang } from '@/lib/i18n';

export default function GlossaryPage() {
  const { t, lang } = useLang();
  const { data } = useGlossary();
  const { data: catalog } = useCatalog();
  const [tab, setTab] = useState<'terms' | 'abbr'>('terms');
  const [f, setF] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const actName = (slug: string) => {
    const a = catalog?.acts.find((x) => x.slug === slug);
    return a ? actShort(a, lang) : slug;
  };
  const q = norm(f.trim());
  const terms = useMemo(() => (data?.terms ?? []).filter((x) => !q || norm(`${x.ru} ${x.uz}`).includes(q)), [data, q]);
  const sortedTerms = useMemo(() => [...terms].sort((a, b) => (lang === 'ru' ? a.ru.localeCompare(b.ru, 'ru') : a.uz.localeCompare(b.uz, 'uz'))), [terms, lang]);

  return (
    <>
      <Header title={t.glossary} back="/search/" />
      <main className="space-y-3 px-4 pt-3">
        <div className="flex rounded-full border border-rule bg-sheet p-1 text-[14px] font-medium" role="tablist">
          {(['terms', 'abbr'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`h-10 flex-1 rounded-full ${tab === v ? 'bg-ink text-paper' : 'text-muted'}`}>
              {v === 'terms' ? t.glossaryTerms : t.glossaryAbbr}
            </button>
          ))}
        </div>

        {tab === 'terms' ? (
          <>
            <input value={f} onChange={(e) => setF(e.target.value)} placeholder={t.glossaryFilter} className="h-11 w-full rounded-lg border border-rule bg-sheet px-3 outline-none focus:border-seal" inputMode="search" />
            <p className="text-[12px] text-muted">{t.glossaryFrom}</p>
            <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
              {sortedTerms.map((x) => {
                const key = `${x.ref.act}/${x.ref.node}/${x.ru}`;
                const first = lang === 'ru' ? x.ru : x.uz;
                const second = lang === 'ru' ? x.uz : x.ru;
                return (
                  <li key={key}>
                    <button type="button" onClick={() => setOpen(open === key ? null : key)} className="block min-h-[52px] w-full px-4 py-2.5 text-left" aria-expanded={open === key}>
                      <span className="block text-[15px] font-semibold leading-snug">{first}</span>
                      <span className="block text-[14px] leading-snug text-seal">{second}</span>
                    </button>
                    {open === key ? (
                      <div className="space-y-2 px-4 pb-3">
                        <p className="font-law text-[15px] leading-relaxed">{lang === 'ru' ? x.defRu : x.defUz}</p>
                        <Link href={`/act/${x.ref.act}/?n=${encodeURIComponent(x.ref.node)}`} className="inline-flex min-h-[40px] items-center text-[13px] text-seal underline">
                          {actName(x.ref.act)} · {x.ref.node.replace(/^.*m(\d+)$/, lang === 'ru' ? 'ст. $1' : '$1-модда').replace(/^.*b(\d+)$/, lang === 'ru' ? 'п. $1' : '$1-банд')}
                        </Link>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <h2 className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.abbrActs}</h2>
            <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
              {data?.actTypes.map((a) => (
                <li key={a.ru} className="px-4 py-2.5">
                  <div className="flex gap-3 text-[15px] font-semibold">
                    <span>{a.ru}</span>
                    <span className="text-seal">{a.uz}</span>
                  </div>
                  <div className="text-[13px] leading-snug text-muted">{lang === 'ru' ? a.fullRu : a.fullUz}</div>
                </li>
              ))}
            </ul>
            <h2 className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.abbrInTexts}</h2>
            <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
              {data?.abbreviations
                .filter((a) => a.lang === lang)
                .map((a) => (
                  <li key={`${a.ref.act}/${a.abbr}`}>
                    <Link href={`/act/${a.ref.act}/?n=${encodeURIComponent(a.ref.node)}`} className="block px-4 py-2.5 active:bg-rule/30">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[15px] font-semibold">{a.abbr}</span>
                        <span className="text-[12px] text-seal">{actName(a.ref.act)}</span>
                      </div>
                      <div className="line-clamp-2 font-law text-[13px] leading-snug text-muted">…{a.context}</div>
                    </Link>
                  </li>
                ))}
            </ul>
          </>
        )}
        <div className="h-4" />
      </main>
    </>
  );
}
