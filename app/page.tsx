'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ActCard } from '@/components/ActCard';
import { Header } from '@/components/Header';
import { IconNext } from '@/components/Icons';
import { actShort, nodeLabel } from '@/lib/format';
import { cachedActs, useCatalog, useAct } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { CatalogAct } from '@/lib/types';

const KIND_ORDER: CatalogAct['kind'][] = ['konst', 'kodeks', 'zru', 'up', 'pp', 'pkm', 'mj', 'other'];

function ContinueCard({ act }: { act: CatalogAct }) {
  const { t, lang } = useLang();
  const last = useStore('last');
  const { act: bundle } = useAct(act.slug, lang);
  const node = last?.node && bundle ? bundle.curById.get(last.node) ?? bundle.uzById.get(last.node) : null;
  return (
    <Link
      href={`/act/${act.slug}/?${last?.node ? `n=${encodeURIComponent(last.node)}&` : ''}r=1`}
      className="flex items-center gap-3 rounded-xl bg-seal px-4 py-3 text-sealink active:opacity-90"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] uppercase tracking-wider opacity-80">{t.continue}</div>
        <div className="truncate text-[16px] font-semibold">
          {actShort(act, lang)}
          {node ? ` · ${nodeLabel(node, lang)}` : ''}
        </div>
        {node?.title ? <div className="truncate text-[13px] opacity-85">{node.title}</div> : null}
      </div>
      <IconNext />
    </Link>
  );
}

export default function ActsPage() {
  const { t, lang } = useLang();
  const { data } = useCatalog();
  const read = useStore('read');
  const last = useStore('last');
  const [view, setView] = useState<'groups' | 'kinds'>('groups');
  const [offline, setOffline] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const v = localStorage.getItem('acts-view');
      if (v === 'kinds' || v === 'groups') setView(v);
    } catch {}
    cachedActs().then(setOffline);
  }, []);

  const readBy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of Object.keys(read)) {
      const s = k.split('/')[0];
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [read]);

  const lastAct = data?.acts.find((a) => a.slug === last?.slug);

  const sections = useMemo(() => {
    if (!data) return [];
    if (view === 'groups')
      return data.groups.map((g) => ({ key: g.id, title: `${g.id}. ${g.title[lang]}`, late: g.late, acts: data.acts.filter((a) => a.group === g.id) }));
    return KIND_ORDER.map((k) => ({ key: k, title: t.kinds[k], late: false, acts: data.acts.filter((a) => a.kind === k) })).filter((s) => s.acts.length);
  }, [data, view, lang, t]);

  return (
    <>
      <Header title={t.appName} sub={t.appShort} />
      <main className="space-y-5 px-4 pt-4">
        {lastAct ? <ContinueCard act={lastAct} /> : null}

        <div className="flex rounded-full border border-rule bg-sheet p-1 text-[14px] font-medium" role="tablist">
          {(['groups', 'kinds'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v);
                try {
                  localStorage.setItem('acts-view', v);
                } catch {}
              }}
              className={`h-10 flex-1 rounded-full ${view === v ? 'bg-ink text-paper' : 'text-muted'}`}
            >
              {v === 'groups' ? t.byGroups : t.byKinds}
            </button>
          ))}
        </div>

        {!data ? <p className="text-muted">{t.loading}</p> : null}

        {sections.map((s) => (
          <section key={s.key} aria-labelledby={`sec-${s.key}`}>
            <h2 id={`sec-${s.key}`} className="mb-2 flex items-baseline gap-2 border-b border-rule pb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
              <span className="min-w-0 flex-1">{s.title}</span>
              {s.late ? <span className="shrink-0 text-[11px] font-normal normal-case tracking-normal">{t.late}</span> : null}
            </h2>
            <div className="space-y-2">
              {s.acts.map((a) => (
                <ActCard key={a.slug} act={a} read={readBy[a.slug] ?? 0} offline={offline.has(a.slug)} />
              ))}
            </div>
          </section>
        ))}
        {data ? (
          <p className="pb-4 text-[12px] text-muted">
            lex.uz · {t.checked} {data.checkedAt.split('-').reverse().join('.')}
          </p>
        ) : null}
      </main>
    </>
  );
}
