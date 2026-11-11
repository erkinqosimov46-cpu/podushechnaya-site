'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/i18n';
import { IconBook, IconBookmark, IconChart, IconCheck, IconSearch } from './Icons';

export function BottomNav() {
  const { t } = useLang();
  const path = usePathname() ?? '/';
  const items = [
    { href: '/', label: t.navActs, Icon: IconBook, active: path === '/' || path.startsWith('/act') },
    { href: '/search/', label: t.navSearch, Icon: IconSearch, active: path.startsWith('/search') || path.startsWith('/glossary') },
    { href: '/tests/', label: t.navTests, Icon: IconCheck, active: path.startsWith('/tests') },
    { href: '/bookmarks/', label: t.navBookmarks, Icon: IconBookmark, active: path.startsWith('/bookmarks') },
    { href: '/progress/', label: t.navProgress, Icon: IconChart, active: path.startsWith('/progress') },
  ];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet/95 backdrop-blur" aria-label="Навигация">
      <ul className="mx-auto grid max-w-app grid-cols-5">
        {items.map(({ href, label, Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none ${active ? 'text-seal' : 'text-muted'}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon width={23} height={23} strokeWidth={active ? 2.2 : 1.8} />
              <span className="max-w-full truncate px-0.5">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
