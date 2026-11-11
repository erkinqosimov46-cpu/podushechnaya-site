'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { nodeLabel, norm, supText } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { normKey, useStore } from '@/lib/store';
import type { ActBundle } from '@/lib/data';
import type { LawNode } from '@/lib/types';
import { IconChevron } from './Icons';

/** Оглавление акта (дерево). Каркас — узбекская версия, подписи — на выбранном языке. */
export function Toc({ act, slug, current, onPick }: { act: ActBundle; slug: string; current: string | null; onPick: (id: string) => void }) {
  const { lang, t } = useLang();
  const read = useStore('read');
  const [filter, setFilter] = useState('');
  const path = useMemo(() => {
    const s = new Set<string>();
    let p = current;
    while (p) {
      s.add(p);
      p = act.parent.get(p) ?? null;
    }
    return s;
  }, [current, act]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(path));
  const curRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  const label = (n: LawNode) => {
    const c = act.curById.get(n.id) ?? n;
    return { label: nodeLabel(c, lang), title: c.type === 'appendix' ? c.title || '' : c.title };
  };

  const f = norm(filter.trim());
  const matches = (n: LawNode): boolean => {
    const l = label(n);
    return norm(`${l.label} ${l.title}`).includes(f) || (n.children ?? []).some(matches);
  };

  const render = (nodes: LawNode[], depth: number) =>
    nodes
      .filter((n) => n.type !== 'preamble' || n.blocks?.length)
      .filter((n) => !f || matches(n))
      .map((n) => {
        const kids = (n.children ?? []).filter((c) => c.type !== 'preamble' || c.blocks?.length);
        const isOpen = !!f || open.has(n.id);
        const l = label(n);
        const isCur = n.id === current;
        const done = !!read[normKey(slug, n.id)];
        return (
          <li key={n.id}>
            <div className="flex items-stretch" style={{ paddingLeft: depth * 12 }}>
              {kids.length ? (
                <button
                  type="button"
                  aria-label="toggle"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((s) => {
                      const x = new Set(s);
                      if (x.has(n.id)) x.delete(n.id);
                      else x.add(n.id);
                      return x;
                    })
                  }
                  className="tap flex w-11 shrink-0 items-center justify-center text-muted"
                >
                  <IconChevron width={18} height={18} className={isOpen ? '' : '-rotate-90'} />
                </button>
              ) : (
                <span className="w-11 shrink-0" />
              )}
              <button
                ref={isCur ? curRef : undefined}
                type="button"
                onClick={() => onPick(n.id)}
                className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left ${isCur ? 'bg-seal/15' : 'active:bg-rule/40'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] leading-snug ${n.repealed ? 'text-muted line-through decoration-1' : kids.length ? 'font-semibold' : 'font-medium'}`}>
                    {l.label}
                    {n.repealed ? <span className="ml-1 text-[12px] font-normal no-underline">— {n.type === 'point' ? t.repealedPoint : t.repealed}</span> : null}
                  </span>
                  {l.title ? <span className="line-clamp-2 block text-[13px] leading-snug text-muted">{supText(l.title)}</span> : null}
                </span>
                {n.scope === 'extra' ? <span className="stamp shrink-0 text-amber">{t.extra}</span> : null}
                {done ? <span className="shrink-0 text-seal">✓</span> : null}
              </button>
            </div>
            {kids.length && isOpen ? <ul>{render(kids, depth + 1)}</ul> : null}
          </li>
        );
      });

  return (
    <div>
      <div className="sticky top-0 z-10 bg-sheet px-2 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="h-11 w-full rounded-lg border border-rule bg-paper px-3 outline-none focus:border-seal"
          inputMode="search"
        />
      </div>
      <ul>{render(act.uz.tree, 0)}</ul>
    </div>
  );
}
