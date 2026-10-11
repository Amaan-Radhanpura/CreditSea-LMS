'use client';

import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { AccountCard } from '@/components/profile/AccountCard';
import { PasswordCard } from '@/components/profile/PasswordCard';
import { useAuth } from '@/components/AuthProvider';
import { Card } from '@/components/ui/Feedback';

export default function StaffProfilePage() {
  const { user } = useAuth();
  const historyHref = user?.role === 'ADMIN' ? `/dashboard/users/${user.id}` : '/dashboard/activity';

  return (
    <>
      <PageHeader title="My profile" description="Your account details and password" />
      <div className="space-y-6">
        <AccountCard />
        <Card>
          <Link href={historyHref} className="group flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <History className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block font-bold text-slate-900">My activity history</span>
              <span className="text-sm text-slate-500">Every action you have taken, as recorded in the audit log</span>
            </span>
            <ArrowRight className="size-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-600" />
          </Link>
        </Card>
        <PasswordCard />
      </div>
    </>
  );
}
