'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, HandCoins, Hash, IndianRupee, PartyPopper, Plus, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR, paymentSchema, toBusinessDate, type LoanDTO, type PaymentDTO, type PaymentResultDTO } from '@lms/shared';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { LoanDetails } from '@/components/dashboard/LoanDetails';
import { RepaymentSchedule } from '@/components/RepaymentSchedule';
import { LoanQueue } from '@/components/dashboard/LoanQueue';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { formatDate, todayISO } from '@/lib/utils';

function PaymentForm({ loan, onRecorded }: { loan: LoanDTO; onRecorded: (r: PaymentResultDTO) => void }) {
  // Pre-fill the amount due on the next instalment (the whole balance for a one-time loan).
  const [form, setForm] = useState({ utr: '', amount: String(loan.nextDue?.amount ?? loan.outstanding), paymentDate: todayISO() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = paymentSchema.safeParse({ ...form, amount: form.amount === '' ? undefined : Number(form.amount) });
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
    if (parsed.data.amount > loan.outstanding) return setErrors({ amount: `Cannot be more than the balance of ${formatINR(loan.outstanding)}` });
    if (loan.disbursedAt && parsed.data.paymentDate < toBusinessDate(new Date(loan.disbursedAt))) {
      return setErrors({ paymentDate: 'Cannot be before the disbursement date' });
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await api.post<PaymentResultDTO>(`/collection/loans/${loan.id}/payments`, parsed.data);
      onRecorded(result);
      setForm({ utr: '', amount: String(result.loan.nextDue?.amount ?? result.loan.outstanding), paymentDate: todayISO() });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'DUPLICATE_UTR') setErrors({ utr: err.message });
      else if (err instanceof ApiClientError && err.code === 'OVERPAYMENT') setErrors({ amount: err.message });
      else if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl bg-brand-50/50 p-4 ring-1 ring-brand-100">
      <p className="flex items-center gap-2 font-bold text-slate-800">
        <Plus className="size-5 text-brand-600" /> Record a payment
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="UTR number" icon={<Hash />} placeholder="e.g. HDFC12345678" className="font-mono uppercase" value={form.utr} error={errors.utr} onChange={(e) => setForm({ ...form, utr: e.target.value.toUpperCase() })} />
        <Field label="Amount" icon={<IndianRupee />} prefix="₹" inputMode="decimal" value={form.amount} error={errors.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        <Field label="Payment date" icon={<CalendarDays />} type="date" max={todayISO()} value={form.paymentDate} error={errors.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
      </div>
      <Button type="submit" loading={busy} className="w-full sm:w-auto" icon={<Receipt className="size-5" />}>
        Save payment
      </Button>
    </form>
  );
}

function CollectionModal({ initial, close, done }: { initial: LoanDTO; close: () => void; done: () => void }) {
  const [loan, setLoan] = useState(initial);
  const [payments, setPayments] = useState<PaymentDTO[] | null>(null);
  const [changed, setChanged] = useState(false);

  const loadPayments = useCallback(() => {
    api.get<PaymentDTO[]>(`/collection/loans/${loan.id}/payments`).then(setPayments).catch((err) => toast.error(errorMessage(err)));
  }, [loan.id]);
  useEffect(loadPayments, [loadPayments]);

  const paidPct = Math.min(100, (loan.amountPaid / loan.totalRepayment) * 100);

  function onRecorded(r: PaymentResultDTO) {
    setLoan(r.loan);
    setPayments((p) => [r.payment, ...(p ?? [])]);
    setChanged(true);
    if (r.loanClosed) toast.success('Fully repaid! The loan is now closed.', { icon: <PartyPopper className="size-5" /> });
    else toast.success(`${formatINR(r.payment.amount)} recorded`);
  }

  return (
    <Modal open onClose={changed ? done : close} size="lg" title="Loan repayments" icon={<HandCoins />}>
      <div className="space-y-6">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-sm text-slate-500">Paid so far</p>
              <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">{formatINR(loan.amountPaid)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Balance left</p>
              <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{formatINR(loan.outstanding)}</p>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500" style={{ width: `${paidPct}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Total to repay {formatINR(loan.totalRepayment)}
            {loan.dueDate && ` · due ${formatDate(loan.dueDate)}`}
          </p>
          {loan.isOverdue && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
              Overdue by {loan.daysOverdue} day{loan.daysOverdue === 1 ? '' : 's'}. The borrower is being reminded automatically.
            </p>
          )}
        </div>

        {loan.status === 'DISBURSED' && <PaymentForm key={loan.amountPaid} loan={loan} onRecorded={onRecorded} />}

        <RepaymentSchedule loan={loan} compact />
        {loan.status === 'CLOSED' && (
          <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <PartyPopper className="size-5" /> This loan is fully repaid and closed.
          </p>
        )}

        <div>
          <p className="mb-2 font-semibold text-slate-700">Payment history</p>
          {!payments ? (
            <Skeleton className="h-24" />
          ) : payments.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-slate-500">No payments yet</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-slate-700">{p.utr}</p>
                    <p className="text-sm text-slate-500">
                      {formatDate(p.paymentDate)}
                      {p.recordedBy && ` · by ${p.recordedBy.name}`}
                    </p>
                  </div>
                  <p className="font-bold text-emerald-700 tabular-nums">{formatINR(p.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="rounded-2xl ring-1 ring-slate-200">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-700">Borrower & loan details</summary>
          <div className="px-4 pb-4">
            <LoanDetails loan={loan} />
          </div>
        </details>
      </div>
    </Modal>
  );
}

export default function CollectionPage() {
  return (
    <>
      <PageHeader module="collection" />
      <LoanQueue
        module="collection"
        showRepayment
        tabs={[
          { value: 'active', label: 'Active loans', status: 'DISBURSED' },
          { value: 'overdue', label: '⚠ Overdue', status: 'DISBURSED', overdue: true },
          { value: 'closed', label: 'Closed', status: 'CLOSED' },
        ]}
        actionLabel={(l) => (l.status === 'DISBURSED' ? 'Collect' : 'View')}
        renderDetail={(loan, close, done) => <CollectionModal initial={loan} close={close} done={done} />}
      />
    </>
  );
}
