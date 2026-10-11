'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle2, FileCheck2, Send, ShieldCheck } from 'lucide-react';
import { formatINR, type LoanDTO } from '@lms/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DEFAULT_QUOTE_INPUT, LoanQuoteInputs, QuotePanel, useLoanQuote, type LoanQuoteInput } from './LoanQuote';

export function LoanConfigStep({
  onBack,
  onApplied,
  initial = DEFAULT_QUOTE_INPUT,
}: {
  onBack?: () => void;
  onApplied: (loan: LoanDTO) => void;
  /** Pre-filled from the Home calculator ("Apply with these numbers"). */
  initial?: LoanQuoteInput;
}) {
  const q = useLoanQuote(initial);
  const { input, quote, emi } = q;
  const [consent, setConsent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function apply() {
    setSubmitting(true);
    setError('');
    try {
      const body =
        input.plan === 'EMI'
          ? { principal: input.principal, repaymentPlan: input.plan, emiMonths: input.months }
          : { principal: input.principal, repaymentPlan: input.plan, tenureDays: input.tenureDays };
      onApplied(await api.post<LoanDTO>('/loans', { ...body, consentAccepted: true }));
    } catch (err) {
      setError(errorMessage(err));
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const keyFacts = [
    { label: 'Loan amount (you get)', value: formatINR(quote.principal) },
    { label: 'Interest rate', value: `${quote.interestRate}% per year (simple)` },
    {
      label: 'Time to repay',
      value: emi ? `${emi.months} month${emi.months === 1 ? '' : 's'} (${emi.tenureDays} days)` : `${quote.tenureDays} days`,
    },
    { label: 'Interest', value: formatINR(quote.simpleInterest) },
    ...(emi ? [{ label: 'Monthly EMI', value: `${formatINR(emi.emi)} × ${emi.months}` }] : [{ label: 'How you repay', value: 'One payment at the end' }]),
    { label: 'Processing fee / other charges', value: '₹0' },
  ];

  return (
    <div className="space-y-6">
      <LoanQuoteInputs q={q} />
      <QuotePanel q={q} />

      {/* Key Fact Statement + consent */}
      <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <p className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <FileCheck2 className="size-6 text-brand-600" /> Key facts about your loan
        </p>
        <dl className="mt-4 divide-y divide-slate-100">
          {keyFacts.map((f) => (
            <div key={f.label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">{f.label}</dt>
              <dd className="text-right font-semibold text-slate-800 tabular-nums">{f.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 pt-3">
            <dt className="font-bold text-slate-800">Total to pay back</dt>
            <dd className="text-right text-lg font-extrabold text-brand-700 tabular-nums">{formatINR(quote.totalRepayment)}</dd>
          </div>
        </dl>
        {emi && (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
            Your first EMI is due 30 days after the money reaches your account, then every 30 days.
          </p>
        )}

        <label
          className={cn(
            'mt-5 flex cursor-pointer items-start gap-4 rounded-2xl p-4 ring-2 transition',
            consent ? 'bg-emerald-50 ring-emerald-400' : 'bg-slate-50 ring-slate-200 hover:ring-slate-300',
          )}
        >
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-7 shrink-0 cursor-pointer accent-emerald-600" />
          <span className="text-base text-slate-700">
            <strong>I agree.</strong> I have read the key facts above and I accept these loan terms.
          </span>
        </label>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 font-medium text-rose-700 ring-1 ring-rose-100">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {onBack ? (
          <Button variant="secondary" size="lg" onClick={onBack}>
            <ArrowLeft className="size-5" /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button variant="success" size="lg" disabled={!consent} onClick={() => setConfirmOpen(true)} icon={<Send className="size-5" />}>
          Apply for loan
        </Button>
      </div>
      {!consent && <p className="text-center text-sm text-slate-500 sm:text-right">Tick &quot;I agree&quot; to apply</p>}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm your loan"
        icon={<ShieldCheck />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Change
            </Button>
            <Button variant="success" onClick={apply} loading={submitting} icon={<CheckCircle2 className="size-5" />}>
              Yes, apply now
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-center">
          <p className="text-slate-500">You will get</p>
          <p className="text-4xl font-extrabold text-slate-900">{formatINR(quote.principal)}</p>
          {emi ? (
            <p className="text-slate-500">
              and pay <strong className="text-brand-700">{formatINR(emi.emi)}</strong> every month for {emi.months} month{emi.months === 1 ? '' : 's'} (total{' '}
              {formatINR(emi.totalRepayment)})
            </p>
          ) : (
            <p className="text-slate-500">
              and pay back <strong className="text-brand-700">{formatINR(quote.totalRepayment)}</strong> in {quote.tenureDays} days
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
