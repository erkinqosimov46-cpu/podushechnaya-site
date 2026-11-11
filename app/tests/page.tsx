'use client';

import Link from 'next/link';
import { KindStamp } from '@/components/ActCard';
import { Header } from '@/components/Header';
import { IconNext } from '@/components/Icons';
import { useCatalog } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function TestsPage() {
  const { t, lang } = useLang();
  const { data: catalog } = useCatalog();
  const history = useStore('tests');
  const answered = useStore('answered');
  const totalQ = catalog?.acts.reduce((a, x) => a + (x.tests[lang] ?? 0), 0) ?? 0;
  const best = (key: string) => {
    const h = history[key];
    if (!h?.length) return null;
    return Math.max(...h.map((x) => Math.round((x.correct / Math.max(1, x.total)) * 100)));
  };

  return (
    <>
      <Header title={t.tests} />
      <main className="space-y-3 px-4 pt-4">
        <Link
          href={totalQ ? '/tests/all/' : '#'}
          aria-disabled={!totalQ}
          className={`flex items-center gap-3 rounded-xl px-4 py-4 ${totalQ ? 'bg-seal text-sealink active:opacity-90' : 'border border-rule bg-sheet text-muted'}`}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold">{t.testsAll}</div>
            <div className="text-[13px] opacity-85">{totalQ ? `${t.testsAllHint} · ${totalQ} ${t.questions}` : t.testsSoon}</div>
          </div>
          {totalQ ? <IconNext /> : null}
        </Link>

        <ul className="space-y-2 pb-4">
          {catalog?.acts.map((a) => {
            const n = a.tests[lang] ?? 0;
            const b = best(a.slug);
            const ok = Object.values(answered[a.slug] ?? {}).filter(Boolean).length;
            const inner = (
              <>
                <div className="flex items-center gap-2">
                  <KindStamp act={a} />
                  <span className="ml-auto text-[12px] text-muted">{n ? `${n} ${t.questions}` : t.testsSoon}</span>
                </div>
                <div className={`mt-1.5 line-clamp-2 text-[15px] font-medium leading-snug ${n ? '' : 'text-muted'}`}>{a.title[lang]}</div>
                {n ? (
                  <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
                    {b != null ? (
                      <span>
                        {t.best}: <b className="text-ink">{b}%</b>
                      </span>
                    ) : null}
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-rule/60">
                      <div className="h-full bg-seal" style={{ width: `${Math.round((ok / n) * 100)}%` }} />
                    </div>
                    <span className="tabular-nums">
                      {ok}/{n}
                    </span>
                  </div>
                ) : null}
              </>
            );
            return (
              <li key={a.slug}>
                {n ? (
                  <Link href={`/tests/${a.slug}/`} className="block rounded-xl border border-rule bg-sheet px-4 py-3 active:bg-rule/30">
                    {inner}
                  </Link>
                ) : (
                  <div className="rounded-xl border border-dashed border-rule px-4 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
