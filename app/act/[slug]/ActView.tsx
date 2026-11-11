'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KindStamp } from '@/components/ActCard';
import { Blocks } from '@/components/Blocks';
import { Header } from '@/components/Header';
import { IconBookmark, IconExternal, IconInfo, IconList, IconNext, IconBack, IconNote } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { Toc } from '@/components/Toc';
import { actNumber, actShort, dmy, nodeLabel, supText } from '@/lib/format';
import { useAct, useCatalog, useStudy, useTests, type ActBundle } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import { normKey, setLast, setNote, update, useBookmark, useRead, useStore } from '@/lib/store';
import type { CatalogAct, LawNode } from '@/lib/types';

function Banner({ tone = 'amber', children }: { tone?: 'amber' | 'seal' | 'stamp'; children: ReactNode }) {
  const c = tone === 'seal' ? 'border-seal/40 bg-seal/10' : tone === 'stamp' ? 'border-stamp/40 bg-stamp/10' : 'border-amber/40 bg-amber/10';
  return <div className={`rounded-lg border px-3 py-2 text-[13px] leading-snug ${c}`}>{children}</div>;
}

function FontButtons() {
  const { t } = useLang();
  const size = useStore('fontSize');
  const set = (d: number) => update((s) => ({ fontSize: Math.max(15, Math.min(22, s.fontSize + d)) }));
  return (
    <div className="flex items-center gap-1" aria-label={t.textSize}>
      <button type="button" onClick={() => set(-1)} disabled={size <= 15} className="tap rounded-lg border border-rule bg-sheet px-2 text-[14px] font-semibold disabled:opacity-40" aria-label="A−">
        A−
      </button>
      <button type="button" onClick={() => set(1)} disabled={size >= 22} className="tap rounded-lg border border-rule bg-sheet px-2 text-[17px] font-semibold disabled:opacity-40" aria-label="A+">
        A+
      </button>
    </div>
  );
}

function Crumbs({ act, slug, id }: { act: ActBundle; slug: string; id: string }) {
  const { lang } = useLang();
  const chain: LawNode[] = [];
  let p = act.parent.get(id) ?? null;
  while (p) {
    const n = act.curById.get(p) ?? act.uzById.get(p);
    if (n) chain.unshift(n);
    p = act.parent.get(p) ?? null;
  }
  if (!chain.length) return null;
  return (
    <nav aria-label="breadcrumbs" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ol className="flex w-max items-center gap-1 text-[12px] text-muted">
        {chain.map((n, i) => (
          <li key={n.id} className="flex items-center gap-1">
            {i ? <span aria-hidden>›</span> : null}
            <Link href={`/act/${slug}/?n=${encodeURIComponent(n.id)}`} className="inline-flex min-h-[32px] items-center whitespace-nowrap underline-offset-2 hover:underline">
              {nodeLabel(n, lang) || n.title.slice(0, 30)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ChildList({ act, slug, nodes }: { act: ActBundle; slug: string; nodes: LawNode[] }) {
  const { lang, t } = useLang();
  const read = useStore('read');
  return (
    <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet">
      {nodes
        .filter((n) => n.type !== 'preamble' || n.blocks?.length)
        .map((n) => {
          const c = act.curById.get(n.id) ?? n;
          const done = !!read[normKey(slug, n.id)];
          return (
            <li key={n.id}>
              <Link href={`/act/${slug}/?n=${encodeURIComponent(n.id)}`} className="flex min-h-[52px] items-center gap-2 px-4 py-2 active:bg-rule/30">
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] font-medium leading-snug ${n.repealed ? 'text-muted line-through decoration-1' : ''}`}>
                    {nodeLabel(c, lang)}
                    {n.repealed ? <span className="ml-1 text-[12px] font-normal">— {n.type === 'point' ? t.repealedPoint : t.repealed}</span> : null}
                  </span>
                  {c.title ? <span className="line-clamp-2 block text-[13px] leading-snug text-muted">{supText(c.title)}</span> : null}
                </span>
                {n.scope === 'extra' ? <span className="stamp shrink-0 text-amber">{t.extra}</span> : null}
                {done ? <span className="text-seal">✓</span> : null}
                <IconNext width={18} height={18} className="shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
    </ul>
  );
}

function Overview({ cat, act, slug, onToc }: { cat: CatalogAct; act: ActBundle; slug: string; onToc: () => void }) {
  const { t, lang } = useLang();
  const ed = cat.edition[lang === 'ru' && cat.coverageRu === 'none' ? 'uz' : lang];
  const lexUrl = cat.lex ? (lang === 'ru' ? `https://lex.uz/ru/docs/${cat.lex.ru}` : `https://lex.uz/docs/${cat.lex.uz}`) : null;
  const intro = act.uz.tree;
  return (
    <div className="space-y-4">
      <div className="ledger rounded-xl border border-rule bg-sheet px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <KindStamp act={cat} />
          {cat.date ? <span className="text-[13px] text-muted">{dmy(cat.date)}</span> : null}
        </div>
        <h1 className="mt-2 font-law text-[20px] font-bold leading-snug">{cat.title[lang]}</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          {cat.number ? (
            <>
              <dt className="text-muted">{cat.kind === 'kodeks' ? t.approvedBy : '№'}</dt>
              <dd>{cat.kind === 'kodeks' ? (lang === 'ru' ? `Законом ${actNumber(cat, lang).replace(/^№ /, '№ ')}` : `${actNumber({ ...cat, kind: 'zru' }, lang)} Қонун`) : actNumber(cat, lang)}</dd>
            </>
          ) : null}
          <dt className="text-muted">{t.edition}</dt>
          <dd>{ed ? dmy(ed) : t.editionOriginal}</dd>
          <dt className="text-muted">{t.status}</dt>
          <dd>{cat.status ?? t.inForce}</dd>
          <dt className="text-muted">{t.checked}</dt>
          <dd>{dmy(cat.fetchedAt)}</dd>
          <dt className="text-muted">{t.source}</dt>
          <dd>{cat.source}</dd>
        </dl>
        {cat.futureEditions.length ? (
          <p className="mt-2 text-[12px] text-amber">
            {t.futureEditions}: {cat.futureEditions.map(dmy).join(', ')}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        {lang === 'ru' && cat.coverageRu === 'none' ? <Banner>{t.noRuText}</Banner> : null}
        {lang === 'ru' && cat.coverageRu === 'partial' ? <Banner>{t.partialRu}</Banner> : null}
        {lang === 'ru' && cat.edition.ru && cat.edition.uz && cat.edition.ru < cat.edition.uz && cat.coverageRu !== 'none' ? (
          <Banner>{t.ruLags(dmy(cat.edition.ru), dmy(cat.edition.uz))}</Banner>
        ) : null}
        {lang === 'uz' && cat.uzScript === 'translit' ? <Banner>{t.translit}</Banner> : null}
        {lang === 'uz' && cat.uzScript === 'cyrl-lexuz' ? <Banner tone="seal">{t.lexUzCyrl}</Banner> : null}
        {cat.scope === 'profile' ? <Banner tone="seal">{t.profileOnly}</Banner> : null}
        {cat.note?.ru ? (
          <Banner tone="stamp">
            <span className="mr-1 inline-block align-[-3px]">
              <IconInfo width={16} height={16} />
            </span>
            {cat.note.ru}
          </Banner>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onToc} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-paper">
          <IconList width={20} height={20} /> {t.toc}
        </button>
        <Link href={`/tests/${slug}/`} className="flex h-12 items-center justify-center rounded-xl border border-ink text-center text-[14px] font-semibold leading-tight">
          {t.testThisAct}
        </Link>
      </div>
      {lexUrl || cat.pages ? (
        <a
          href={lexUrl ?? cat.pages![0][lang]}
          target="_blank"
          rel="noopener"
          className="flex min-h-[44px] items-center gap-2 text-[14px] text-seal underline underline-offset-2"
        >
          <IconExternal width={18} height={18} /> {lexUrl ? t.openLex : t.openSource}
        </a>
      ) : null}

      {act.cur.head.length || act.uz.head.length ? (
        <div className="law space-y-1 text-center text-[0.92em] text-muted">
          {(lang === 'ru' && act.cur.coverage === 'none' ? act.uz.head : act.cur.head)
            .filter((h) => !['unoffial', 'official_sour_text'].includes(h.k))
            .map((h, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: h.html }} />
            ))}
        </div>
      ) : null}

      <ChildList act={act} slug={slug} nodes={intro} />
    </div>
  );
}

function StudyTabs({ slug, node, children }: { slug: string; node: LawNode; children: ReactNode }) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<'text' | 'meaning' | 'example' | 'test'>('text');
  const study = useStudy(slug, lang);
  const tests = useTests(slug, lang);
  useEffect(() => setTab('text'), [node.id]);
  const s = study.data?.nodes[node.id];
  const qs = tests.data?.questions.filter((q) => q.node === node.id) ?? [];
  const tabs = [
    ['text', t.tabText],
    ['meaning', t.tabMeaning],
    ['example', t.tabExample],
    ['test', t.tabTest],
  ] as const;
  const comment = (body?: string, extra?: ReactNode) => (
    <div className="space-y-3">
      <div className="stamp text-amber">{t.commentaryLabel}</div>
      {body ? <div className="whitespace-pre-line text-[16px] leading-relaxed">{body}</div> : <p className="text-muted">{t.commentarySoon}</p>}
      {extra}
    </div>
  );
  return (
    <div>
      <div role="tablist" className="no-scrollbar sticky top-[calc(56px+env(safe-area-inset-top))] z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-rule bg-paper/95 px-4 backdrop-blur">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-11 shrink-0 border-b-2 px-3 text-[14px] font-medium ${tab === k ? 'border-seal text-ink' : 'border-transparent text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tab === 'text' ? children : null}
        {tab === 'meaning'
          ? comment(
              s?.meaning,
              s?.mistakes ? (
                <div className="rounded-lg border border-stamp/40 bg-stamp/5 p-3 text-[15px] leading-relaxed">
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-stamp">!</div>
                  <div className="whitespace-pre-line">{s.mistakes}</div>
                </div>
              ) : null,
            )
          : null}
        {tab === 'example' ? comment(s?.example) : null}
        {tab === 'test' ? (
          qs.length ? (
            <Link href={`/tests/${slug}/?node=${encodeURIComponent(node.id)}`} className="flex h-12 items-center justify-center rounded-xl bg-seal font-semibold text-sealink">
              {t.start} · {qs.length} {t.questions}
            </Link>
          ) : (
            <p className="text-muted">{t.testsSoon}</p>
          )
        ) : null}
      </div>
    </div>
  );
}

function NoteSheet({ slug, id, open, onClose }: { slug: string; id: string; open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const notes = useStore('notes');
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(notes[normKey(slug, id)]?.text ?? '');
  }, [open, slug, id, notes]);
  return (
    <Sheet open={open} onClose={onClose} title={t.note}>
      <div className="space-y-3 px-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.notePlaceholder} rows={6} className="w-full rounded-lg border border-rule bg-paper p-3 leading-relaxed outline-none focus:border-seal" />
        <div className="flex gap-2">
          <button
            type="button"
            className="h-12 flex-1 rounded-xl bg-seal font-semibold text-sealink"
            onClick={() => {
              setNote(slug, id, text);
              onClose();
            }}
          >
            {t.save}
          </button>
          {notes[normKey(slug, id)] ? (
            <button
              type="button"
              className="h-12 rounded-xl border border-rule px-4 text-stamp"
              onClick={() => {
                setNote(slug, id, '');
                onClose();
              }}
            >
              {t.delete}
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function LeafBar({ act, slug, id }: { act: ActBundle; slug: string; id: string }) {
  const { t } = useLang();
  const [bm, toggleBm] = useBookmark(slug, id);
  const [rd, toggleRd] = useRead(slug, id);
  const notes = useStore('notes');
  const [noteOpen, setNoteOpen] = useState(false);
  const i = act.leaves.indexOf(id);
  const prev = i > 0 ? act.leaves[i - 1] : null;
  const next = i >= 0 && i < act.leaves.length - 1 ? act.leaves[i + 1] : null;
  const href = (n: string) => `/act/${slug}/?n=${encodeURIComponent(n)}`;
  const btn = 'tap flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium';
  return (
    <>
      <div className="safe-bottom fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-app border-t border-rule bg-sheet/95 px-2 py-1 backdrop-blur" style={{ paddingBottom: 4 }}>
        <div className="grid grid-cols-5 gap-1">
          {prev ? (
            <Link href={href(prev)} className={`${btn} text-ink`} aria-label={t.prev}>
              <IconBack width={20} height={20} />
              {t.prev}
            </Link>
          ) : (
            <span />
          )}
          <button type="button" onClick={toggleBm} className={`${btn} ${bm ? 'text-seal' : 'text-muted'}`} aria-pressed={bm}>
            <IconBookmark width={20} height={20} filled={bm} />
            {bm ? t.bookmarked : t.bookmark}
          </button>
          <button type="button" onClick={() => setNoteOpen(true)} className={`${btn} ${notes[normKey(slug, id)] ? 'text-seal' : 'text-muted'}`}>
            <IconNote width={20} height={20} />
            {t.note}
          </button>
          <button type="button" onClick={toggleRd} className={`${btn} ${rd ? 'text-seal' : 'text-muted'}`} aria-pressed={rd}>
            <span className={`flex h-5 w-5 items-center justify-center rounded border-2 text-[12px] ${rd ? 'border-seal bg-seal text-sealink' : 'border-current'}`}>{rd ? '✓' : ''}</span>
            {t.markRead}
          </button>
          {next ? (
            <Link href={href(next)} className={`${btn} text-ink`} aria-label={t.next}>
              <IconNext width={20} height={20} />
              {t.next}
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
      <NoteSheet slug={slug} id={id} open={noteOpen} onClose={() => setNoteOpen(false)} />
    </>
  );
}

function NodePage({ cat, act, slug, id, q }: { cat: CatalogAct; act: ActBundle; slug: string; id: string; q: string | null }) {
  const { t, lang } = useLang();
  const uzNode = act.uzById.get(id);
  const curNode = act.curById.get(id);
  if (!uzNode) return <p className="text-muted">{t.notFound}</p>;
  const useCur = lang === 'uz' || (act.cur.coverage !== 'none' && !!curNode);
  const node = useCur && curNode ? curNode : uzNode;
  const fallback = lang === 'ru' && !useCur;
  const isLeaf = ['article', 'point', 'page', 'preamble'].includes(uzNode.type);
  const blocks = node.blocks ?? [];
  const lexBase = cat.lex ? (useCur && lang === 'ru' ? `https://lex.uz/ru/docs/${cat.lex.ru}` : `https://lex.uz/docs/${cat.lex.uz}`) : null;

  const text = (
    <div className="space-y-3">
      {fallback ? <Banner>{act.cur.coverage === 'none' ? t.noRuText : t.noRuNode}</Banner> : null}
      {lang === 'uz' && cat.uzScript === 'translit' ? <Banner>{t.translit}</Banner> : null}
      {uzNode.repealed ? (
        <div className="rounded-lg border border-rule bg-sheet p-3 text-[14px] text-muted">
          <div className="mb-1 font-semibold text-stamp">{uzNode.type === 'point' ? t.repealedPoint : t.repealed}</div>
          {(curNode?.repealed && useCur ? curNode.repealed : uzNode.repealed) ?? ''}
        </div>
      ) : null}
      {blocks.length ? <Blocks node={node} blocks={blocks} q={q} mode={act.uz.mode} /> : null}
      {node.sign?.length ? (
        <div className="law space-y-0.5 pt-2 text-right text-[0.9em] text-muted">
          {node.sign.map((h, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: h }} />
          ))}
        </div>
      ) : null}
      {lexBase && node.lexId ? (
        <a href={`${lexBase}#${node.lexId}`} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center gap-2 font-ui text-[13px] text-seal underline underline-offset-2">
          <IconExternal width={16} height={16} /> {t.openLex}
        </a>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-3">
      <Crumbs act={act} slug={slug} id={id} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {node.type !== 'page' ? <span className="text-[13px] font-semibold uppercase tracking-wider text-seal">{nodeLabel(node, lang)}</span> : null}
            {uzNode.scope === 'extra' ? <span className="stamp text-amber">{t.extra}</span> : null}
          </div>
          {node.title ? <h1 className="mt-0.5 font-law text-[20px] font-bold leading-snug">{supText(node.title)}</h1> : null}
        </div>
        {isLeaf ? <FontButtons /> : null}
      </div>
      {isLeaf ? (
        <StudyTabs slug={slug} node={uzNode}>
          {text}
        </StudyTabs>
      ) : (
        <>
          {blocks.length ? text : null}
          {/* Текст приложения без пунктов (формы, таблицы) показываем сразу, а не отдельной строкой «Преамбула». */}
          {(uzNode.children ?? [])
            .filter((c) => c.type === 'preamble' && c.blocks?.length)
            .map((c) => {
              const pc = (useCur ? act.curById.get(c.id) : null) ?? c;
              return <Blocks key={c.id} node={pc} blocks={pc.blocks ?? []} q={q} mode={act.uz.mode} />;
            })}
          {uzNode.children?.some((c) => c.type !== 'preamble') ? <ChildList act={act} slug={slug} nodes={uzNode.children.filter((c) => c.type !== 'preamble')} /> : null}
        </>
      )}
      {isLeaf ? <div className="h-16" /> : null}
      {isLeaf ? <LeafBar act={act} slug={slug} id={id} /> : null}
    </div>
  );
}

export function ActView({ slug }: { slug: string }) {
  const { t, lang } = useLang();
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('n');
  const q = params.get('q');
  const { data: catalog } = useCatalog();
  const { act, error } = useAct(slug, lang);
  const lastPos = useStore('last');
  const [tocOpen, setTocOpen] = useState(false);
  const cat = useMemo(() => catalog?.acts.find((a) => a.slug === slug), [catalog, slug]);

  const resume = params.get('r') === '1';
  useEffect(() => {
    if (!resume) {
      setLast(slug, id, 0);
      window.scrollTo(0, 0);
    }
    // запоминаем позицию прокрутки, чтобы «Продолжить» вернуло на то же место
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setLast(slug, id, Math.round(window.scrollY));
      }, 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id]);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!resume || restored || !act || !catalog) return;
    const y = lastPos?.slug === slug && lastPos.node === id ? lastPos.scroll ?? 0 : 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
    setRestored(true);
  }, [resume, restored, act, catalog, slug, id, lastPos]);

  const node = id && act ? act.curById.get(id) ?? act.uzById.get(id) : null;
  const parentId = id && act ? act.parent.get(id) ?? null : null;

  return (
    <>
      <Header
        title={cat ? actShort(cat, lang) : '…'}
        sub={node ? nodeLabel(node, lang) : cat ? cat.title[lang] : undefined}
        back={id ? (parentId ? `/act/${slug}/?n=${encodeURIComponent(parentId)}` : `/act/${slug}/`) : '/'}
        right={
          act ? (
            <button type="button" onClick={() => setTocOpen(true)} className="tap flex items-center justify-center rounded-full text-ink" aria-label={t.toc}>
              <IconList />
            </button>
          ) : null
        }
      />
      <main className="px-4 pb-6 pt-3">
        {error ? <Banner tone="stamp">{navigator.onLine ? t.notFound : t.offlineMissing}</Banner> : null}
        {!act || !cat ? (!error ? <p className="text-muted">{t.loading}</p> : null) : id ? (
          <NodePage cat={cat} act={act} slug={slug} id={id} q={q} />
        ) : (
          <Overview cat={cat} act={act} slug={slug} onToc={() => setTocOpen(true)} />
        )}
      </main>
      {act ? (
        <Sheet open={tocOpen} onClose={() => setTocOpen(false)} title={t.toc}>
          <Toc
            act={act}
            slug={slug}
            current={id}
            onPick={(n) => {
              setTocOpen(false);
              router.push(`/act/${slug}/?n=${encodeURIComponent(n)}`);
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}
