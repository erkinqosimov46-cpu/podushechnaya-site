'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { actShort, nodeLabel, shuffle, supText } from '@/lib/format';
import { loadAct, loadJson, useCatalog, type ActBundle } from '@/lib/data';
import { useLang } from '@/lib/i18n';
import { update, useStore } from '@/lib/store';
import type { Lang, Question, TestBank } from '@/lib/types';

type Item = { slug: string; id: string; perm: number[] };
type Session = { key: string; mode: 'train' | 'exam'; items: Item[]; idx: number; answers: Record<string, number[]>; checked: Record<string, boolean>; deadline: number | null; finished: boolean };

const SEC_PER_Q = 60;
const qkey = (it: { slug: string; id: string }) => `${it.slug}/${it.id}`;
const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** Банки вопросов нужных актов на текущем языке (ID вопросов одинаковы в RU и UZ). */
function useBanks(slugs: string[], lang: Lang) {
  const [banks, setBanks] = useState<Record<string, TestBank>>({});
  const [loading, setLoading] = useState(true);
  const sig = slugs.join(',');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(slugs.map((s) => loadJson<TestBank>(`tests/${s}.${lang}.json`).then((b) => [s, b] as const).catch(() => [s, null] as const))).then((list) => {
      if (!alive) return;
      const out: Record<string, TestBank> = {};
      for (const [s, b] of list) if (b) out[s] = b;
      setBanks(out);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, lang]);
  return { banks, loading };
}

function useActs(slugs: string[], lang: Lang) {
  const [acts, setActs] = useState<Record<string, ActBundle>>({});
  const sig = slugs.join(',');
  useEffect(() => {
    slugs.forEach((s) =>
      loadAct(s, lang)
        .then((b) => setActs((p) => ({ ...p, [s]: b })))
        .catch(() => {}),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, lang]);
  return acts;
}

function Choice({ label, kind, state, onClick, disabled }: { label: string; kind: 'one' | 'many'; state: 'idle' | 'picked' | 'right' | 'wrong' | 'missed'; onClick: () => void; disabled: boolean }) {
  const tone = {
    idle: 'border-rule bg-sheet',
    picked: 'border-seal bg-seal/10',
    right: 'border-seal bg-seal/15',
    wrong: 'border-stamp bg-stamp/10',
    missed: 'border-seal border-dashed bg-sheet',
  }[state];
  const mark = state === 'right' ? '✓' : state === 'wrong' ? '✕' : state === 'picked' ? '●' : '';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex min-h-[56px] w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-[16px] leading-snug ${tone}`}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[13px] ${kind === 'one' ? 'rounded-full' : 'rounded'} ${state === 'idle' || state === 'missed' ? 'border-rule' : state === 'wrong' ? 'border-stamp text-stamp' : 'border-seal text-seal'}`}>{mark}</span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}

export function TestView({ slug }: { slug: string }) {
  const { t, lang } = useLang();
  const params = useSearchParams();
  const nodeFilter = params.get('node');
  const { data: catalog } = useCatalog();
  const history = useStore('tests');
  const isAll = slug === 'all';
  const slugs = useMemo(() => (isAll ? (catalog?.acts.filter((a) => (a.tests.ru ?? 0) + (a.tests.uz ?? 0) > 0).map((a) => a.slug) ?? []) : [slug]), [isAll, catalog, slug]);
  const { banks, loading } = useBanks(slugs, lang);
  const acts = useActs(slugs, lang);
  const cat = catalog?.acts.find((a) => a.slug === slug);

  const [chapter, setChapter] = useState<string>('');
  const [count, setCount] = useState<number>(10);
  const [mode, setMode] = useState<'train' | 'exam'>('train');
  const [s, setS] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());

  const pool = useMemo(() => {
    const out: { slug: string; q: Question }[] = [];
    for (const sl of slugs) for (const q of banks[sl]?.questions ?? []) out.push({ slug: sl, q });
    return out;
  }, [banks, slugs]);
  const qById = useMemo(() => new Map(pool.map((p) => [qkey({ slug: p.slug, id: p.q.id }), p])), [pool]);

  const chapters = useMemo(() => {
    if (isAll) return [];
    const ids = [...new Set(pool.map((p) => p.q.chapter).filter(Boolean))] as string[];
    const b = acts[slug];
    return ids.map((id) => {
      const n = b?.curById.get(id) ?? b?.uzById.get(id);
      return { id, label: n ? `${nodeLabel(n, lang)} ${n.title}`.trim() : id, n: pool.filter((p) => p.q.chapter === id).length };
    });
  }, [pool, acts, slug, lang, isAll]);

  useEffect(() => {
    if (!s?.deadline || s.finished) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [s?.deadline, s?.finished]);

  const timeLeft = s?.deadline ? Math.max(0, Math.round((s.deadline - now) / 1000)) : null;
  useEffect(() => {
    if (s && !s.finished && s.deadline && timeLeft === 0) finish(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  function start(items: { slug: string; q: Question }[], m = mode) {
    const chosen = shuffle(items).slice(0, count === 0 ? items.length : count);
    const its = chosen.map(({ slug: sl, q }) => ({ slug: sl, id: q.id, perm: shuffle(q.options.map((_, i) => i)) }));
    setS({ key: isAll ? 'all' : slug, mode: m, items: its, idx: 0, answers: {}, checked: {}, deadline: m === 'exam' ? Date.now() + its.length * SEC_PER_Q * 1000 : null, finished: false });
    window.scrollTo(0, 0);
  }

  function finish(cur: Session) {
    const wrong: string[] = [];
    let correct = 0;
    const ans: Record<string, Record<string, boolean>> = {};
    for (const it of cur.items) {
      const p = qById.get(qkey(it));
      if (!p) continue;
      const ok = same(cur.answers[qkey(it)] ?? [], p.q.correct);
      if (ok) correct++;
      else wrong.push(qkey(it));
      (ans[it.slug] ??= {})[it.id] = ok;
    }
    update((st) => {
      const answered = { ...st.answered };
      for (const [sl, m] of Object.entries(ans)) answered[sl] = { ...(answered[sl] ?? {}), ...m };
      const list = [...(st.tests[cur.key] ?? []), { at: Date.now(), mode: cur.mode, total: cur.items.length, correct, wrong }].slice(-30);
      return { answered, tests: { ...st.tests, [cur.key]: list } };
    });
    setS({ ...cur, finished: true });
    window.scrollTo(0, 0);
  }

  const title = isAll ? t.testsAll : cat ? actShort(cat, lang) : '…';
  const header = <Header title={title} sub={t.tests} back={s && !s.finished ? undefined : isAll ? '/tests/' : `/tests/`} />;

  if (loading && !pool.length) {
    return (
      <>
        {header}
        <main className="px-4 pt-4 text-muted">{t.loading}</main>
      </>
    );
  }

  if (!pool.length) {
    return (
      <>
        {header}
        <main className="space-y-3 px-4 pt-6">
          <p className="text-[16px]">{t.testsSoon}</p>
          {!isAll ? (
            <Link href={`/act/${slug}/`} className="inline-flex min-h-[44px] items-center text-seal underline">
              {cat?.title[lang]}
            </Link>
          ) : null}
        </main>
      </>
    );
  }

  // ── Настройка ──
  if (!s) {
    const base = nodeFilter ? pool.filter((p) => p.q.node === nodeFilter) : chapter ? pool.filter((p) => p.q.chapter === chapter) : pool;
    const hist = (history[isAll ? 'all' : slug] ?? []).slice().reverse();
    return (
      <>
        {header}
        <main className="space-y-5 px-4 pb-28 pt-4">
          {!isAll && chapters.length && !nodeFilter ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.chooseChapter}</legend>
              <select value={chapter} onChange={(e) => setChapter(e.target.value)} className="h-12 w-full rounded-xl border border-rule bg-sheet px-3">
                <option value="">
                  {t.scopeWhole} · {pool.length}
                </option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {supText(c.label).slice(0, 80)} · {c.n}
                  </option>
                ))}
              </select>
            </fieldset>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.count}</legend>
            <div className="grid grid-cols-3 gap-2">
              {[10, 20, 0].map((c) => (
                <button key={c} type="button" onClick={() => setCount(c)} aria-pressed={count === c} className={`h-12 rounded-xl border-2 text-[16px] font-semibold ${count === c ? 'border-seal bg-seal/10 text-seal' : 'border-rule bg-sheet'}`}>
                  {c || `${t.countAll} (${base.length})`}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.mode}</legend>
            <div className="space-y-2">
              {(['train', 'exam'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`block w-full rounded-xl border-2 px-4 py-3 text-left ${mode === m ? 'border-seal bg-seal/10' : 'border-rule bg-sheet'}`}>
                  <span className="block text-[16px] font-semibold">{m === 'train' ? t.modeTrain : t.modeExam}</span>
                  <span className="block text-[13px] text-muted">{m === 'train' ? t.modeTrainHint : t.modeExamHint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {hist.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.history}</h2>
              <ul className="divide-y divide-rule rounded-xl border border-rule bg-sheet text-[14px]">
                {hist.slice(0, 8).map((h, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2">
                    <span className="flex-1 text-muted">{new Date(h.at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-Cyrl-UZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <span className="text-muted">{h.mode === 'exam' ? t.modeExam : t.modeTrain}</span>
                    <span className="w-12 text-right font-semibold tabular-nums">{Math.round((h.correct / Math.max(1, h.total)) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-app border-t border-rule bg-paper/95 px-4 py-2 backdrop-blur">
            <button type="button" disabled={!base.length} onClick={() => start(base)} className="h-12 w-full rounded-xl bg-seal text-[16px] font-semibold text-sealink disabled:opacity-50">
              {t.start}
            </button>
          </div>
        </main>
      </>
    );
  }

  // ── Результат ──
  if (s.finished) {
    const res = s.items.map((it) => ({ it, p: qById.get(qkey(it)), a: s.answers[qkey(it)] ?? [] }));
    const ok = res.filter((r) => r.p && same(r.a, r.p.q.correct)).length;
    const pct = Math.round((ok / Math.max(1, s.items.length)) * 100);
    const wrong = res.filter((r) => r.p && !same(r.a, r.p.q.correct));
    return (
      <>
        {header}
        <main className="space-y-4 px-4 pb-32 pt-4">
          <section className="ledger rounded-xl border border-rule bg-sheet p-4 text-center">
            <div className="text-[13px] uppercase tracking-wide text-muted">{t.result}</div>
            <div className={`font-law text-[56px] font-bold leading-none ${pct >= 80 ? 'text-seal' : pct >= 50 ? 'text-amber' : 'text-stamp'}`}>{pct}%</div>
            <div className="mt-1 text-[14px] text-muted">
              {ok} / {s.items.length} · {s.mode === 'exam' ? t.modeExam : t.modeTrain}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              {t.mistakes} · {wrong.length}
            </h2>
            {wrong.length ? (
              <ul className="space-y-2">
                {wrong.map(({ it, p, a }) => (
                  <li key={qkey(it)} className="rounded-xl border border-rule bg-sheet p-3 text-[14px]">
                    <p className="font-medium leading-snug">{p!.q.q}</p>
                    {a.length ? <p className="mt-1 text-stamp">✕ {a.map((i) => p!.q.options[i]).join('; ')}</p> : <p className="mt-1 text-stamp">✕ —</p>}
                    <p className="mt-0.5 text-seal">✓ {p!.q.correct.map((i) => p!.q.options[i]).join('; ')}</p>
                    <Link href={`/act/${it.slug}/?n=${encodeURIComponent(p!.q.ref.node ?? p!.q.node)}`} className="mt-1 inline-flex min-h-[36px] items-center text-[13px] text-seal underline">
                      {t.norm}: {isAll ? `${actShort(catalog!.acts.find((x) => x.slug === it.slug)!, lang)}, ` : ''}
                      {p!.q.ref.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-seal">{t.noMistakes}</p>
            )}
          </section>
          <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-app grid-cols-2 gap-2 border-t border-rule bg-paper/95 px-4 py-2 backdrop-blur">
            <button type="button" disabled={!wrong.length} onClick={() => start(wrong.map((w) => w.p!), s.mode)} className="h-12 rounded-xl bg-seal text-[14px] font-semibold leading-tight text-sealink disabled:opacity-40">
              {t.retryWrong}
            </button>
            <button type="button" onClick={() => setS(null)} className="h-12 rounded-xl border border-ink text-[14px] font-semibold">
              {t.again}
            </button>
          </div>
        </main>
      </>
    );
  }

  // ── Вопрос ──
  const it = s.items[s.idx];
  const p = qById.get(qkey(it));
  const key = qkey(it);
  const picked = s.answers[key] ?? [];
  const checked = !!s.checked[key];
  const many = p?.q.type === 'multi';
  const last = s.idx === s.items.length - 1;
  const toggle = (i: number) => {
    if (checked) return;
    const next = many ? (picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i]) : [i];
    setS({ ...s, answers: { ...s.answers, [key]: next } });
  };
  const go = () => {
    if (s.mode === 'train' && !checked) {
      setS({ ...s, checked: { ...s.checked, [key]: true } });
      return;
    }
    if (last) finish(s);
    else {
      setS({ ...s, idx: s.idx + 1 });
      window.scrollTo(0, 0);
    }
  };
  const isRight = p ? same(picked, p.q.correct) : false;

  return (
    <>
      {header}
      <main className="space-y-4 px-4 pb-32 pt-3">
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <span className="font-semibold text-ink">
            {t.question} {s.idx + 1} / {s.items.length}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule/60">
            <div className="h-full bg-seal" style={{ width: `${((s.idx + 1) / s.items.length) * 100}%` }} />
          </div>
          {timeLeft != null ? (
            <span className={`tabular-nums font-semibold ${timeLeft < 60 ? 'text-stamp' : 'text-ink'}`} aria-label={t.timeLeft}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          ) : null}
        </div>
        {!p ? (
          <p className="text-muted">{t.loading}</p>
        ) : (
          <>
            {isAll ? <div className="text-[12px] font-semibold text-seal">{actShort(catalog!.acts.find((x) => x.slug === it.slug)!, lang)}</div> : null}
            <h1 className="text-[18px] font-semibold leading-snug">{p.q.q}</h1>
            <p className="text-[13px] text-muted">{many ? t.chooseMany : t.chooseOne}</p>
            <div className="space-y-2">
              {it.perm.map((oi) => {
                const sel = picked.includes(oi);
                const corr = p.q.correct.includes(oi);
                const state = checked ? (corr && sel ? 'right' : sel ? 'wrong' : corr ? 'missed' : 'idle') : sel ? 'picked' : 'idle';
                return <Choice key={oi} label={p.q.options[oi]} kind={many ? 'many' : 'one'} state={state} onClick={() => toggle(oi)} disabled={checked} />;
              })}
            </div>
            {checked ? (
              <section className={`space-y-2 rounded-xl border p-3 ${isRight ? 'border-seal/50 bg-seal/10' : 'border-stamp/50 bg-stamp/5'}`} aria-live="polite">
                <div className={`text-[15px] font-semibold ${isRight ? 'text-seal' : 'text-stamp'}`}>{isRight ? t.correct : t.wrong}</div>
                {!isRight ? (
                  <p className="text-[14px]">
                    <b>{t.correctAnswer}:</b> {p.q.correct.map((i) => p.q.options[i]).join('; ')}
                  </p>
                ) : null}
                <p className="text-[14px] leading-relaxed">
                  <b>{t.explanation}:</b> {p.q.explain}
                </p>
                <Link href={`/act/${it.slug}/?n=${encodeURIComponent(p.q.ref.node ?? p.q.node)}`} className="inline-flex min-h-[40px] items-center text-[14px] text-seal underline">
                  {t.norm}: {p.q.ref.label}
                </Link>
              </section>
            ) : null}
          </>
        )}
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-app gap-2 border-t border-rule bg-paper/95 px-4 py-2 backdrop-blur">
          {s.mode === 'exam' ? (
            <button type="button" onClick={() => finish(s)} className="h-12 rounded-xl border border-rule px-4 text-[14px] text-muted">
              {t.finish}
            </button>
          ) : null}
          <button type="button" disabled={!picked.length && !(s.mode === 'exam')} onClick={go} className="h-12 flex-1 rounded-xl bg-seal text-[16px] font-semibold text-sealink disabled:opacity-40">
            {s.mode === 'train' && !checked ? t.answer : last ? t.finish : t.next}
          </button>
        </div>
      </main>
    </>
  );
}
