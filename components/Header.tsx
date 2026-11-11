'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLang } from '@/lib/i18n';
import { IconBack } from './Icons';

/** Шапка экрана: «назад», заголовок, переключатель РУ / ЎЗ (всегда виден). */
export function Header({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: string | true; right?: ReactNode }) {
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="flex h-14 items-center gap-1 px-2">
        {back ? (
          <button
            type="button"
            className="tap -ml-1 flex items-center justify-center rounded-full text-ink active:bg-rule/40"
            aria-label={t.back}
            onClick={() => (back === true ? router.back() : router.push(back))}
          >
            <IconBack />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold leading-tight">{title}</div>
          {sub ? <div className="truncate text-[12px] leading-tight text-muted">{sub}</div> : null}
        </div>
        {right}
        <div className="flex h-11 shrink-0 overflow-hidden rounded-full border border-rule bg-sheet p-1 text-[13px] font-semibold" role="group" aria-label="Язык / Тил">
          {(['ru', 'uz'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`min-h-[36px] min-w-[44px] rounded-full px-2 ${lang === l ? 'bg-seal text-sealink' : 'text-muted'}`}
            >
              {l === 'ru' ? 'РУ' : 'ЎЗ'}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
