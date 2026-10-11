'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Bot, CheckCircle2, Eye, FilePlus2, FileUp, HandCoins, KeyRound, Lock, UserCheck, UserPen, UserPlus, UserRound, XCircle, type LucideIcon } from 'lucide-react';
import { formatINR, type AuditAction, type AuditEntryDTO, type Role } from '@lms/shared';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { usePaginated } from '@/hooks/usePaginated';
import { cn, formatDateTime } from '@/lib/utils';
import { Pagination } from './ListControls';

const ACTION_META: Record<AuditAction, { icon: LucideIcon; tone: string; verb: string }> = {
  USER_REGISTERED: { icon: UserPlus, tone: 'bg-slate-100 text-slate-600', verb: 'created an account' },
  ACCOUNT_UPDATED: { icon: UserPen, tone: 'bg-slate-100 text-slate-600', verb: 'updated their account' },
  PASSWORD_CHANGED: { icon: KeyRound, tone: 'bg-slate-100 text-slate-600', verb: 'changed their password' },
  PROFILE_SUBMITTED: { icon: UserRound, tone: 'bg-slate-100 text-slate-600', verb: 'submitted personal details' },
  SLIP_UPLOADED: { icon: FileUp, tone: 'bg-slate-100 text-slate-600', verb: 'uploaded a salary slip' },
  PAN_CARD_UPLOADED: { icon: FileUp, tone: 'bg-slate-100 text-slate-600', verb: 'uploaded a PAN card' },
  LOAN_APPLIED: { icon: FilePlus2, tone: 'bg-amber-100 text-amber-700', verb: 'applied for a loan' },
  LOAN_ASSIGNED: { icon: UserCheck, tone: 'bg-indigo-100 text-indigo-700', verb: 'assigned the loan' },
  DOCUMENT_VIEWED: { icon: Eye, tone: 'bg-sky-100 text-sky-700', verb: 'reviewed a document' },
  LOAN_SANCTIONED: { icon: CheckCircle2, tone: 'bg-sky-100 text-sky-700', verb: 'approved the loan' },
  LOAN_REJECTED: { icon: XCircle, tone: 'bg-rose-100 text-rose-700', verb: 'rejected the loan' },
  LOAN_DISBURSED: { icon: Banknote, tone: 'bg-violet-100 text-violet-700', verb: 'released the money' },
  PAYMENT_RECORDED: { icon: HandCoins, tone: 'bg-emerald-100 text-emerald-700', verb: 'recorded a payment' },
  LOAN_CLOSED: { icon: Lock, tone: 'bg-emerald-100 text-emerald-700', verb: 'closed the loan (fully repaid)' },
};

const ROLE_SHORT: Record<Role, string> = {
  ADMIN: 'Admin',
  SALES: 'Sales',
  SANCTION: 'Sanction',
  DISBURSEMENT: 'Disbursement',
  COLLECTION: 'Collection',
  BORROWER: 'Borrower',
};

/** One-line plain-language extra info for an entry. */
function detailLine(e: AuditEntryDTO): string | null {
  const d = e.details as Record<string, string | number | boolean | string[] | null | undefined>;
  switch (e.action) {
    case 'ACCOUNT_UPDATED':
      return `Name: ${d.from} → ${d.to}`;
    case 'PASSWORD_CHANGED':
      return 'Other devices were logged out';
    case 'PROFILE_SUBMITTED':
      return d.brePassed ? 'Eligibility check passed' : `Eligibility check failed: ${(d.failedRules as string[] | undefined)?.join(', ').toLowerCase()}`;
    case 'SLIP_UPLOADED':
    case 'PAN_CARD_UPLOADED':
    case 'DOCUMENT_VIEWED':
      return String(d.fileName ?? '');
    case 'LOAN_APPLIED':
      return `${formatINR(Number(d.principal))} for ${d.tenureDays} days · terms accepted`;
    case 'LOAN_ASSIGNED':
      return `To ${d.assigneeName} (${String(d.stage).toLowerCase()})${d.previousAssignee ? `, was ${d.previousAssignee}` : ''} · ${d.reason}`;
    case 'LOAN_REJECTED':
      return `Reason: ${d.note}`;
    case 'PAYMENT_RECORDED':
      return `${formatINR(Number(d.amount))} · UTR ${d.utr} · balance left ${formatINR(Number(d.outstandingAfter))}`;
    case 'LOAN_SANCTIONED':
    case 'LOAN_DISBURSED':
      return d.assignedTo && d.actedByAssignee === false ? `Assigned to ${d.assignedTo}, done by someone else` : null;
    default:
      return null;
  }
}

export function AuditEntry({ entry, linkUsers }: { entry: AuditEntryDTO; linkUsers?: boolean }) {
  const meta = ACTION_META[entry.action];
  const extra = detailLine(entry);
  const who = entry.actor ? (
    linkUsers ? (
      <Link href={`/dashboard/users/${entry.actor.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
        {entry.actor.name}
      </Link>
    ) : (
      <span className="font-semibold text-slate-900">{entry.actor.name}</span>
    )
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
      <Bot className="size-4" /> System
    </span>
  );

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span className="absolute top-11 bottom-0 left-5 w-px bg-slate-200 last:hidden" aria-hidden />
      <span className={cn('relative grid size-10 shrink-0 place-items-center rounded-xl', meta.tone)}>
        <meta.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-slate-700">
          {who}
          {entry.actor && <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">{ROLE_SHORT[entry.actor.role]}</span>}{' '}
          {meta.verb}
          {entry.loan && entry.action !== 'LOAN_APPLIED' && (
            <>
              {' '}for <span className="font-semibold text-slate-900">{entry.loan.applicantName}</span>
            </>
          )}
        </p>
        {extra && <p className="mt-0.5 text-sm break-words text-slate-500">{extra}</p>}
        <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(entry.at)}</p>
      </div>
    </li>
  );
}

/** Paginated activity feed for any audit endpoint (a user's history, a loan's trail, "my activity"). */
export function AuditFeed({ path, linkUsers, emptyText = 'No activity yet' }: { path: string; linkUsers?: boolean; emptyText?: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = usePaginated<AuditEntryDTO>(path, { page, limit: 15 });

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (!data || data.items.length === 0) return <EmptyState title={emptyText} />;

  return (
    <div>
      <ol>
        {data.items.map((e) => (
          <AuditEntry key={e.id} entry={e} linkUsers={linkUsers} />
        ))}
      </ol>
      <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
    </div>
  );
}
