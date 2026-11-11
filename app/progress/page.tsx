'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { IconDownload } from '@/components/Icons';
import { actShort, nodeLabel, supText } from '@/lib/format';
import { cachedActs, downloadAll, loadAct, useCatalog, usePlan, type ActBundle } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import { normKey, update, useStore } from '@/lib/store';
import type { LawNode } from '@/lib/types';

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-rule/60">
      <div className="h-full rounded-full bg-seal" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Offline() {
  const { t } = useLang();
  const { data: catalog } = useCatalog();
  const [cached, setCached] = useState<Set<string> | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);
  const refresh = () => {
    cachedActs().then(setCached);
    navigator.storage?.estimate?.().then((e) => e.usage && setUsage(`${(e.usage / 1024 / 1024).toFixed(0)} МБ`));
  };
  useEffect(refresh, []);
  const total = catalog?.acts.length ?? 0;
  const all = cached && total && cached.size >= total;
  return (
    <section className="space-y-2 rounded-xl border border-rule bg-sheet p-4">
      <h2 className="text-[16px] font-semibold">{t.offline}</h2>
      <p className="text-[13px] text-muted">{t.offlineHint}</p>
      {cached ? (
        <p className="text-[14px]">
          {t.offlineCount(cached.size, total)}
          {usage ? <span className="text-muted"> · {usage}</span> : null}
        </p>
      ) : null}
      {prog ? (
        <div className="space-y-1">
          <Bar pct={(prog.done / Math.max(1, prog.total)) * 100} />
          <p className="text-[13px] text-muted">{t.offlineRunning(prog.done, prog.total)}</p>
        </div>
      ) : null}
      {err ? <p className="text-[13px] text-stamp">{t.offlineError}</p> : null}
      <button
        type="button"
        disabled={!!prog}
        onClick={async () => {
          setErr(false);
          const r = await downloadAll((done, total) => setProg({ done, total }));
          setProg(null);
          setErr(r.failed > 0);
          refresh();
        }}
        className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold ${all ? 'border border-seal text-seal' : 'bg-seal text-sealink'} disabled:opacity-60`}
      >
        <IconDownload width={20} height={20} /> {all ? t.offlineDone : t.offlineAll}
      </button>
    </section>
  );
}

/** Сколько «листьев» (статей/пунктов) внутри узла и сколько из них изучено. */
function leafStats(n: LawNode | undefined, slug: string, read: Record<string, number>) {
  let total = 0;
  let done = 0;
  const walk = (x: LawNode) => {
    if ((x.type === 'article' || x.type === 'point' || x.type === 'page') && !x.repealed) {
      total++;
      if (read[normKey(slug, x.id)]) done++;
    }
    x.children?.forEach(walk);
  };
  if (n) walk(n);
  return { total, done };
}

function Plan() {
  const { t, lang } = useLang();
  const { data: plan } = usePlan();
  const { data: catalog } = useCatalog();
  const read = useStore('read');
  const [acts, setActs] = useState<Record<string, ActBundle>>({});
  useEffect(() => {
    if (!plan) return;
    const slugs = [...new Set(plan.weeks.flatMap((w) => w.items.map((i) => i.act)))];
    slugs.forEach((s) =>
      loadAct(s, lang)
        .then((b) => setActs((p) => ({ ...p, [s]: b })))
        .catch(() => {}),
    );
  }, [plan, lang]);
  if (!plan || !catalog) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[16px] font-semibold">{t.plan}</h2>
      <p className="text-[12px] text-muted">{plan.note[lang]}</p>
      <ol className="space-y-3">
        {plan.weeks.map((w, wi) => {
          const rows = w.items.map((it) => {
            const b = acts[it.act];
            const cat = catalog.acts.find((a) => a.slug === it.act);
            const node = b ? (it.node ? b.uzById.get(it.node) : ({ id: 'root', type: 'section', num: null, label: '', title: '', children: b.uz.tree } as LawNode)) : undefined;
            const st = leafStats(node, it.act, read);
            const cur = it.node && b ? b.curById.get(it.node) ?? node : null;
            const label = cur ? supText(`${nodeLabel(cur, lang)} ${cur.title || ''}`.trim()) : '';
            return { it, cat, st, label };
          });
          const tot = rows.reduce((a, r) => a + r.st.total, 0);
          const dn = rows.reduce((a, r) => a + r.st.done, 0);
          return (
            <li key={wi} className="rounded-xl border border-rule bg-sheet">
              <div className="space-y-2 px-4 pb-2 pt-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="flex-1 text-[15px] font-semibold leading-snug">{w.title[lang]}</h3>
                  <span className="text-[13px] tabular-nums text-muted">{tot ? Math.round((dn / tot) * 100) : 0}%</span>
                </div>
                <Bar pct={tot ? (dn / tot) * 100 : 0} />
              </div>
              <ul className="divide-y divide-rule border-t border-rule">
                {rows.map(({ it, cat, st, label }, i) => (
                  <li key={i}>
                    <Link href={`/act/${it.act}/${it.node ? `?n=${encodeURIComponent(it.node)}` : ''}`} className="flex min-h-[48px] items-center gap-3 px-4 py-2 active:bg-rule/30">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-[11px] ${st.total && st.done === st.total ? 'border-seal bg-seal text-sealink' : 'border-rule'}`}>
                        {st.total && st.done === st.total ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-seal">{cat ? actShort(cat, lang) : it.act}</span>
                        <span className="line-clamp-2 block text-[14px] leading-snug">{label || cat?.title[lang]}</span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-muted">{st.total ? `${st.done}/${st.total}` : ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function ProgressPage() {
  const { t, lang } = useLang();
  const { data: catalog } = useCatalog();
  const read = useStore('read');
  const tests = useStore('tests');
  const readBy = useMemo(() => {
    const m: Record<string, number> = {};
    Object.keys(read).forEach((k) => {
      const s = k.split('/')[0];
      m[s] = (m[s] ?? 0) + 1;
    });
    return m;
  }, [read]);
  const total = catalog?.acts.reduce((a, x) => a + x.leaves, 0) ?? 0;
  const done = Object.keys(read).length;
  const started = catalog?.acts.filter((a) => readBy[a.slug]) ?? [];

  return (
    <>
      <Header title={t.progress} />
      <main className="space-y-5 px-4 pt-4">
        <section className="ledger rounded-xl border border-rule bg-sheet p-4">
          <div className="text-[13px] uppercase tracking-wide text-muted">{t.progressTotal}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-law text-[40px] font-bold leading-none tabular-nums">{done}</span>
            <span className="text-[15px] text-muted">/ {total}</span>
          </div>
          <div className="mt-3">
            <Bar pct={total ? (done / total) * 100 : 0} />
          </div>
          {started.length ? (
            <ul className="mt-4 space-y-2">
              {started.map((a) => (
                <li key={a.slug}>
                  <Link href={`/act/${a.slug}/`} className="block">
                    <div className="mb-1 flex text-[13px]">
                      <span className="flex-1 truncate font-medium">{actShort(a, lang)}</span>
                      <span className="tabular-nums text-muted">
                        {readBy[a.slug]}/{a.leaves}
                      </span>
                    </div>
                    <Bar pct={(readBy[a.slug] / Math.max(1, a.leaves)) * 100} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <Plan />
        <Offline />

        <button
          type="button"
          className="h-11 w-full rounded-xl border border-rule text-[14px] text-stamp"
          onClick={() => {
            if (confirm(t.resetConfirm)) update(() => ({ read: {}, tests: {}, answered: {} }));
          }}
        >
          {t.resetProgress}
        </button>
        {Object.keys(tests).length ? null : null}
        <div className="h-2" />
      </main>
    </>
  );
}
