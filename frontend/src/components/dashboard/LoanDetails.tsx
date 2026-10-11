'use client';

import { useState } from 'react';
import { Briefcase, CalendarDays, CreditCard, ExternalLink, FileText, IndianRupee, UserRound } from 'lucide-react';
import { DOCUMENT_LABEL, formatINR, type LoanDTO } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { LoanTimeline } from '@/components/LoanTimeline';
import { RepaymentSchedule } from '@/components/RepaymentSchedule';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EMPLOYMENT_LABEL, formatBytes, formatDate } from '@/lib/utils';
import { AssigneeControl } from './AssigneeControl';
import { AuditFeed } from './AuditFeed';
import { Tabs } from './ListControls';

function Row({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="font-semibold break-words text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function DetailsTab({ loan, showSlip, onLoanChange }: { loan: LoanDTO; showSlip?: boolean; onLoanChange: (l: LoanDTO) => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-3xl font-extrabold text-slate-900">{formatINR(loan.principal)}</p>
          <p className="text-slate-500">
            {loan.repaymentPlan === 'EMI' ? `${loan.emiMonths} monthly EMIs` : `${loan.tenureDays} days`} · {loan.interestRate}% p.a. · repay{' '}
            {formatINR(loan.totalRepayment)}
          </p>
        </div>
        <StatusBadge status={loan.status} />
      </div>

      <AssigneeControl loan={loan} onChange={onLoanChange} />

      <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
        <Row icon={UserRound} label="Full name" value={loan.applicant.fullName} />
        <Row icon={CreditCard} label="PAN" value={<span className="font-mono tracking-wider">{loan.applicant.pan}</span>} />
        <Row icon={CalendarDays} label="Date of birth" value={formatDate(loan.applicant.dob)} />
        <Row icon={IndianRupee} label="Monthly salary" value={formatINR(loan.applicant.monthlySalary)} />
        <Row icon={Briefcase} label="Employment" value={EMPLOYMENT_LABEL[loan.applicant.employmentMode]} />
        <Row icon={FileText} label="Interest" value={formatINR(loan.simpleInterest)} />
      </div>

      {showSlip && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[loan.salarySlip, loan.panCard].map(
            (doc) =>
              doc && (
                <a
                  key={doc.id}
                  href={`/api/documents/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-2xl p-4 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-brand-300"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    {doc.kind === 'PAN_CARD' ? <CreditCard className="size-5" /> : <FileText className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-800">{DOCUMENT_LABEL[doc.kind]}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {doc.originalName} · {formatBytes(doc.size)}
                    </span>
                  </span>
                  <ExternalLink className="size-5 text-slate-400" />
                </a>
              ),
          )}
          <p className="text-xs text-slate-400 sm:col-span-2">Opening a document is recorded in the audit trail.</p>
        </div>
      )}

      <RepaymentSchedule loan={loan} compact />

      <div>
        <p className="mb-3 font-semibold text-slate-700">Progress</p>
        <LoanTimeline loan={loan} />
        {loan.rejectionReason && <p className="mt-2 rounded-xl bg-rose-50 px-4 py-3 text-rose-700">Reason: {loan.rejectionReason}</p>}
      </div>
    </div>
  );
}

/** Loan summary + assignee + full audit trail, shared by every ops module's detail modal. */
export function LoanDetails({ loan: initial, showSlip }: { loan: LoanDTO; showSlip?: boolean }) {
  const [loan, setLoan] = useState(initial);
  const [tab, setTab] = useState<'details' | 'audit'>('details');
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { value: 'details', label: 'Details' },
          { value: 'audit', label: 'Audit trail' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'audit' ? <AuditFeed path={`/audit/loans/${loan.id}`} linkUsers={user?.role === 'ADMIN'} /> : <DetailsTab loan={loan} showSlip={showSlip} onLoanChange={setLoan} />}
    </div>
  );
}
