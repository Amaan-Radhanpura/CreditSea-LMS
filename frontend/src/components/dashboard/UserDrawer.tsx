'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  ImageIcon,
  IndianRupee,
  Mail,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { BRE_RULES, DOCUMENT_LABEL, calculateAge, formatINR, type DocumentDTO, type UserDetailsDTO } from '@lms/shared';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, errorMessage } from '@/lib/api';
import { ROLE_LABEL, ROLE_TONE } from '@/lib/roles';
import { EMPLOYMENT_LABEL, cn, formatBytes, formatDate, formatDateTime } from '@/lib/utils';
import { AuditFeed } from './AuditFeed';
import { Tabs } from './ListControls';
import { UserAvatar } from './UserAvatar';

type Tab = 'overview' | 'documents' | 'loans' | 'history';

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-slate-400" />
      <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-semibold break-words text-slate-800">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
      <h3 className="mb-1 font-bold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function Overview({ d }: { d: UserDetailsDTO }) {
  const { user, profile } = d;
  const age = profile ? calculateAge(profile.dob) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Actions', value: user.actionCount },
          { label: user.role === 'BORROWER' ? 'Loans' : 'Open assigned', value: user.loanCount },
          { label: 'Documents', value: d.documents.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-4 text-center ring-1 ring-slate-200">
            <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <Section title="Account">
        <dl className="divide-y divide-slate-100">
          <InfoRow icon={UserRound} label="Name" value={user.name} />
          <InfoRow icon={Mail} label="Email" value={user.email} />
          <InfoRow icon={ShieldCheck} label="Role" value={ROLE_LABEL[user.role]} />
          <InfoRow icon={CalendarDays} label="Joined" value={formatDate(user.createdAt)} />
          <InfoRow icon={Activity} label="Last active" value={user.lastActiveAt ? formatDateTime(user.lastActiveAt) : '—'} />
        </dl>
      </Section>

      {user.role === 'BORROWER' &&
        (profile ? (
          <>
            <Section title="Personal details">
              <dl className="divide-y divide-slate-100">
                <InfoRow icon={UserRound} label="Full name (PAN)" value={profile.fullName} />
                <InfoRow icon={CreditCard} label="PAN" value={<span className="font-mono tracking-wider">{profile.pan}</span>} />
                <InfoRow icon={CalendarDays} label="Date of birth" value={`${formatDate(profile.dob)} · ${age} years`} />
                <InfoRow icon={IndianRupee} label="Monthly salary" value={formatINR(profile.monthlySalary)} />
                <InfoRow icon={Briefcase} label="Employment" value={EMPLOYMENT_LABEL[profile.employmentMode]} />
              </dl>
            </Section>

            <Section title="Eligibility check (BRE)">
              <div
                className={cn(
                  'mt-2 flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold',
                  profile.bre.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                )}
              >
                {profile.bre.passed ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                {profile.bre.passed ? 'Eligible' : 'Not eligible'} · checked {formatDateTime(profile.bre.checkedAt)}
              </div>
              <ul className="mt-3 space-y-2">
                {[
                  { rule: 'AGE', label: `Age ${BRE_RULES.MIN_AGE}–${BRE_RULES.MAX_AGE}` },
                  { rule: 'SALARY', label: 'Salary ≥ ₹25,000 / month' },
                  { rule: 'PAN', label: 'Valid PAN format' },
                  { rule: 'EMPLOYMENT', label: 'Employed or self-employed' },
                ].map((r) => {
                  const failure = profile.bre.failures.find((f) => f.rule === r.rule);
                  return (
                    <li key={r.rule} className="flex items-start gap-2">
                      {failure ? <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />}
                      <span className={failure ? 'text-rose-700' : 'text-slate-700'}>
                        {r.label}
                        {failure && <span className="block text-sm text-rose-600">{failure.message}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </>
        ) : (
          <EmptyState icon={<UserRound />} title="No personal details yet" message="This person signed up but has not filled in their details." />
        ))}
    </div>
  );
}

function DocumentPreview({ doc }: { doc: DocumentDTO }) {
  const url = `/api/documents/${doc.id}`;
  const isPdf = doc.mimeType === 'application/pdf';
  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {isPdf ? <FileText className="size-5 text-rose-500" /> : <ImageIcon className="size-5 text-sky-500" />}
        <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">{doc.originalName}</p>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          New tab <ExternalLink className="size-4" />
        </a>
      </div>
      <div className="bg-slate-100">
        {isPdf ? (
          <iframe src={url} title={doc.originalName} className="h-[60dvh] w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={doc.originalName} className="mx-auto max-h-[60dvh] object-contain" />
        )}
      </div>
    </div>
  );
}

function Documents({ docs }: { docs: UserDetailsDTO['documents'] }) {
  const [selected, setSelected] = useState(docs[0]?.id ?? null);
  if (docs.length === 0) return <EmptyState icon={<FileText />} title="No documents uploaded" />;
  const current = docs.find((d) => d.id === selected);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {docs.map((doc) => (
          <li key={doc.id}>
            <button
              onClick={() => setSelected(doc.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition',
                selected === doc.id ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-slate-200 hover:ring-slate-300',
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                {doc.mimeType === 'application/pdf' ? <FileText className="size-5" /> : <ImageIcon className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-800">{doc.originalName}</span>
                <span className="text-sm text-slate-500">
                  {DOCUMENT_LABEL[doc.kind]} · {formatBytes(doc.size)} · {formatDateTime(doc.uploadedAt)}
                </span>
              </span>
              {doc.isCurrent && <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Current</span>}
            </button>
          </li>
        ))}
      </ul>
      {current && <DocumentPreview key={current.id} doc={current} />}
      <p className="text-center text-xs text-slate-400">Opening a document is recorded in the audit log.</p>
    </div>
  );
}

function Loans({ d }: { d: UserDetailsDTO }) {
  if (d.loans.length === 0) {
    return <EmptyState title={d.user.role === 'BORROWER' ? 'No loans yet' : 'No open loans assigned'} />;
  }
  return (
    <ul className="space-y-3">
      {d.loans.map((l) => (
        <li key={l.id} className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xl font-extrabold text-slate-900">{formatINR(l.principal)}</p>
              <p className="text-sm text-slate-500">
                {d.user.role !== 'BORROWER' && `${l.applicant.fullName} · `}
                {l.tenureDays} days · applied {formatDate(l.appliedAt)}
              </p>
            </div>
            <StatusBadge status={l.status} />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-emerald-500" style={{ width: `${(l.amountPaid / l.totalRepayment) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Paid {formatINR(l.amountPaid)} of {formatINR(l.totalRepayment)}
            {l.assignee && ` · assigned to ${l.assignee.name}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Admin side panel with everything about one user. */
export function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [data, setData] = useState<UserDetailsDTO | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(() => {
    if (!userId) return;
    setData(null);
    setError('');
    api.get<UserDetailsDTO>(`/admin/users/${userId}/details`).then(setData).catch((err) => setError(errorMessage(err)));
  }, [userId]);

  useEffect(() => {
    setTab('overview');
    load();
  }, [load]);

  const header = data ? (
    <div className="flex items-center gap-3">
      <UserAvatar user={data.user} />
      <div className="min-w-0">
        <h2 className="truncate text-lg font-bold text-slate-900">{data.profile?.fullName ?? data.user.name}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn('rounded-md px-1.5 py-0.5 font-semibold', ROLE_TONE[data.user.role])}>{ROLE_LABEL[data.user.role]}</span>
          <Link href={`/dashboard/users/${data.user.id}`} className="font-semibold text-brand-600 hover:underline">
            Full page
          </Link>
        </div>
      </div>
    </div>
  ) : undefined;

  return (
    <Drawer open={!!userId} onClose={onClose} title="User details" header={header}>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-5">
          <Tabs<Tab>
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'documents', label: `Documents (${data.documents.length})` },
              { value: 'loans', label: `Loans (${data.loans.length})` },
              { value: 'history', label: 'History' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'overview' && <Overview d={data} />}
          {tab === 'documents' && <Documents docs={data.documents} />}
          {tab === 'loans' && <Loans d={data} />}
          {tab === 'history' && (
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <AuditFeed path={`/admin/users/${data.user.id}/activity`} linkUsers />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
