import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'Ғазна · Законы — справочник для сотрудника Казначейства',
  description: 'Учебный справочник по законодательству для сотрудника Комитета казначейской службы при МЭФ Узбекистана. Официальные тексты с lex.uz на русском и узбекском.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Ғазна', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f0e5' },
    { media: '(prefers-color-scheme: dark)', color: '#111513' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <div className="mx-auto flex min-h-[100dvh] max-w-app flex-col bg-paper">
            <div className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))]">{children}</div>
          </div>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
