'use client';

import Link from 'next/link';
import { actNumber, dmy } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import type { CatalogAct } from '@/lib/types';

export function KindStamp({ act }: { act: CatalogAct }) {
  const { t, lang } = useLang();
  const tone = act.kind === 'mj' || act.kind === 'other' ? 'text-amber' : act.kind === 'kodeks' || act.kind === 'konst' ? 'text-stamp' : 'text-seal';
  const text = act.kind === 'kodeks' || act.kind === 'konst' || act.kind === 'other' || !act.number ? t.kindShort[act.kind] : actNumber(act, lang);
  return <span className={`stamp ${tone}`}>{text}</span>;
}

export function ActCard({ act, read, offline }: { act: CatalogAct; read: number; offline?: boolean }) {
  const { lang } = useLang();
  const pct = act.leaves ? Math.round((read / act.leaves) * 100) : 0;
  return (
    <Link href={`/act/${act.slug}/`} className="block rounded-xl border border-rule bg-sheet px-4 py-3 active:bg-rule/30">
      <div className="flex items-center gap-2">
        <KindStamp act={act} />
        <span className="text-[12px] text-muted">{dmy(act.date)}</span>
        {offline ? <span className="ml-auto h-2 w-2 rounded-full bg-seal" title="offline" /> : null}
      </div>
      <div className="mt-1.5 line-clamp-3 text-[15px] font-medium leading-snug">{act.title[lang]}</div>
      {read > 0 ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule/60" aria-label={`${pct}%`}>
          <div className="h-full bg-seal" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      ) : null}
    </Link>
  );
}
