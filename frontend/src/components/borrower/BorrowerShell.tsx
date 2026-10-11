'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUserRound, FilePlus2, House, LogOut, Wallet } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { DeniedNotice } from '@/components/DeniedNotice';
import { NotificationBell } from '@/components/NotificationBell';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/apply', label: 'Apply', icon: FilePlus2 },
  { href: '/my-loans', label: 'My loans', icon: Wallet },
  { href: '/profile', label: 'Profile', icon: CircleUserRound },
];

export function BorrowerShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <Suspense>
        <DeniedNotice />
      </Suspense>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-2 rounded-xl px-3.5 py-2 font-semibold transition-colors',
                    // Only the current page gets a filled pill; hover just changes the text colour,
                    // so two items can never look selected at the same time.
                    active ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'text-slate-600 hover:text-brand-700',
                  )}
                >
                  <Icon className="size-5" /> {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            {user && (
              <Link href="/profile" className="hidden items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 lg:flex">
                <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{user.name.charAt(0).toUpperCase()}</span>
                <span className="text-sm font-semibold text-slate-700">{user.name.split(' ')[0]}</span>
              </Link>
            )}
            <button onClick={logout} className="flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-rose-600" aria-label="Log out">
              <LogOut className="size-5" /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      {/* Phones and small tablets: big bottom tab bar with icon + word */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Main"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-1 py-2.5 text-xs font-semibold', active ? 'text-brand-600' : 'text-slate-500')}
            >
              <span className={cn('grid h-8 w-14 place-items-center rounded-full transition', active && 'bg-brand-100')}>
                <Icon className="size-6" />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
