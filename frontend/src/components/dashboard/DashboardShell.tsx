'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUserRound, HandCoins, History, Landmark, LayoutDashboard, LogOut, Megaphone, Menu, ScrollText, Users, X } from 'lucide-react';
import type { DashboardModule } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { DeniedNotice } from '@/components/DeniedNotice';
import { NotificationBell } from '@/components/NotificationBell';
import { Logo } from '@/components/ui/Logo';
import { ROLE_LABEL } from '@/lib/roles';
import { allowedModules } from '@/lib/routes';
import { cn } from '@/lib/utils';

export const MODULE_META: Record<DashboardModule, { label: string; icon: typeof Megaphone; description: string }> = {
  sales: { label: 'Sales', icon: Megaphone, description: 'Registered users who have not applied yet' },
  sanction: { label: 'Sanction', icon: ScrollText, description: 'Review applications and approve or reject' },
  disbursement: { label: 'Disbursement', icon: Landmark, description: 'Release money for approved loans' },
  collection: { label: 'Collection', icon: HandCoins, description: 'Record repayments for active loans' },
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const nav = user
    ? [
        ...(user.role === 'ADMIN' ? [{ href: '/dashboard', label: 'Overview', icon: LayoutDashboard }] : []),
        ...allowedModules(user.role).map((m) => ({ href: `/dashboard/${m}`, label: MODULE_META[m].label, icon: MODULE_META[m].icon })),
        user.role === 'ADMIN' ? { href: '/dashboard/users', label: 'Users & history', icon: Users } : { href: '/dashboard/activity', label: 'My activity', icon: History },
        { href: '/dashboard/profile', label: 'My profile', icon: CircleUserRound },
      ]
    : [];

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-950 text-brand-100">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo light />
        <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <p className="px-5 pt-4 pb-2 text-xs font-semibold tracking-wider text-brand-300/70 uppercase">Operations</p>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition',
                active ? 'bg-white/15 text-white shadow-inner' : 'hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon className="size-5" /> {label}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="m-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="truncate font-semibold text-white">{user.name}</p>
          <p className="truncate text-sm text-brand-200/80">{ROLE_LABEL[user.role]}</p>
          <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm font-semibold text-white hover:bg-white/20">
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <Suspense>
        <DeniedNotice />
      </Suspense>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur lg:hidden">
        <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-6" />
        </button>
        <Logo />
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </header>
      <div className="sticky top-0 z-30 hidden h-16 items-center justify-end gap-3 border-b border-slate-200/70 bg-white/80 px-10 backdrop-blur lg:flex">
        {user && <span className="text-sm text-slate-500">Signed in as <strong className="text-slate-700">{user.name}</strong></span>}
        <NotificationBell />
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}

export function PageHeader({ module, title, description, children }: { module?: DashboardModule; title?: string; description?: string; children?: React.ReactNode }) {
  const meta = module ? MODULE_META[module] : null;
  const Icon = meta?.icon ?? LayoutDashboard;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
          <Icon className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{title ?? meta?.label}</h1>
          <p className="text-slate-500">{description ?? meta?.description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
