'use client';

import { useState } from 'react';
import { useLang } from '@/lib/i18n';
import type { Block, LawNode } from '@/lib/types';
import { IconHistory } from './Icons';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Подсветка искомых слов только в тексте, не внутри тегов. */
export function highlight(html: string, q?: string | null): string {
  const words = (q ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map(escapeRe);
  if (!words.length) return html;
  const re = new RegExp(`(${words.join('|')})`, 'giu');
  return html.replace(/(^|>)([^<]+)/g, (_, gt: string, txt: string) => gt + txt.replace(re, '<mark>$1</mark>'));
}

function BlockNotes({ b }: { b: Block }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const has = (b.changes?.length ?? 0) > 0 || !!b.prev || (b.lexNotes?.length ?? 0) > 0;
  if (!has && !b.unofficial) return null;
  return (
    <div className="mt-1 font-ui text-[12px] leading-snug">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {b.unofficial ? <span className="text-amber">◆ {t.unofficial}</span> : null}
        {has ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex min-h-[32px] items-center gap-1 text-muted underline-offset-2 hover:underline" aria-expanded={open}>
            <IconHistory width={15} height={15} /> {t.changes}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-1 space-y-1 border-l-2 border-rule pl-2 text-muted">
          {b.changes?.map((c, i) => <p key={i}>{c}</p>)}
          {b.lexNotes?.map((h, i) => (
            <p key={`n${i}`}>
              <span className="font-medium">{t.lexNote}: </span>
              <span className="law-inline" dangerouslySetInnerHTML={{ __html: h.replace(/<a /g, '<a target="_blank" rel="noopener" ') }} />
            </p>
          ))}
          {b.prev ? (
            <p>
              <a href={b.prev} target="_blank" rel="noopener" className="text-seal underline">
                {t.prevEdition} ↗
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Официальный текст: абзацы как в источнике, таблицы прокручиваются внутри своего блока. */
export function Blocks({ node, blocks, q, mode }: { node?: LawNode; blocks: Block[]; q?: string | null; mode?: 'articles' | 'points' | 'pages' }) {
  const { t, lang } = useLang();
  const parts = new Set(blocks.map((b) => b.part).filter(Boolean));
  const showParts = node?.type === 'article' && mode === 'articles' && parts.size > 1;
  let lastPart: number | undefined;
  return (
    <div className="law">
      {blocks.map((b, i) => {
        const html = highlight(b.html.replace(/<a /g, '<a target="_blank" rel="noopener" '), q);
        const partLabel = showParts && b.part && b.part !== lastPart ? (lang === 'ru' ? `${t.partShort} ${b.part}` : `${b.part}-${t.partShort}`) : null;
        lastPart = b.part ?? lastPart;
        const cls = b.k === 'center' ? 'text-center font-semibold' : b.k === 'right' ? 'text-right' : b.k === 'footnote' ? 'text-[0.85em] text-muted' : '';
        return (
          <div key={`${b.lexId ?? ''}-${i}`} id={b.lexId ? `l${b.lexId}` : undefined} className={i ? 'mt-[0.6em]' : ''}>
            {partLabel ? <div className="mb-0.5 font-ui text-[11px] font-semibold uppercase tracking-wider text-seal">{partLabel}</div> : null}
            {b.k === 'table' ? (
              <div className="table-wrap" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p className={cls} dangerouslySetInnerHTML={{ __html: html }} />
            )}
            <BlockNotes b={b} />
          </div>
        );
      })}
    </div>
  );
}
