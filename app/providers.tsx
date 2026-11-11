'use client';

import { useEffect, type ReactNode } from 'react';
import { LangProvider } from '@/lib/i18n';
import { useStore } from '@/lib/store';

function FontSize() {
  const size = useStore('fontSize');
  useEffect(() => {
    document.documentElement.style.setProperty('--law-size', `${size}px`);
  }, [size]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return (
    <LangProvider>
      <FontSize />
      {children}
    </LangProvider>
  );
}
