'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';

/** Шторка снизу (bottom sheet). Закрывается свайпом вниз, тапом по фону или крестиком. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panel}
        className="safe-bottom absolute inset-x-0 bottom-0 mx-auto flex max-h-[86dvh] max-w-app flex-col rounded-t-[18px] border-t border-rule bg-sheet shadow-2xl"
        onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
        onTouchMove={(e) => {
          if (startY.current == null || !panel.current) return;
          const dy = e.touches[0].clientY - startY.current;
          const body = panel.current.querySelector('[data-sheet-body]') as HTMLElement | null;
          if (dy > 0 && (!body || body.scrollTop <= 0)) panel.current.style.transform = `translateY(${dy}px)`;
        }}
        onTouchEnd={(e) => {
          if (startY.current == null || !panel.current) return;
          const dy = e.changedTouches[0].clientY - startY.current;
          panel.current.style.transform = '';
          startY.current = null;
          if (dy > 90) onClose();
        }}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1.5 w-10 rounded-full bg-rule" />
        </div>
        <div className="flex items-center gap-2 px-4 pb-2 pt-1">
          <div className="min-w-0 flex-1 text-[16px] font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="tap -mr-2 flex items-center justify-center text-muted" aria-label="Закрыть">
            <IconClose />
          </button>
        </div>
        <div data-sheet-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
