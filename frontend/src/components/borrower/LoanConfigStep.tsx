'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CalendarRange, CheckCircle2, FileCheck2, IndianRupee, Repeat, Send, ShieldCheck, Wallet } from 'lucide-react';
import { EMI_RULES, LOAN_RULES, calculateEmi, calculateLoan, formatINR, type LoanDTO, type RepaymentPlan } from '@lms/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AmountSlider } from './AmountSlider';

const AMOUNT_PRESETS = [50_000, 100_000, 200_000, 500_000].map((v) => ({ value: v, label: v >= 100_000 ? `₹${v / 100_000}L` : `₹${v / 1000}K` }));
const TENURE_PRESETS = [30, 90, 180, 365].map((v) => ({ value: v, label: `${v} days` }));
const MONTH_PRESETS = [3, 6, 9, 12].map((v) => ({ value: v, label: `${v} months` }));

const PLANS: { value: RepaymentPlan; title: string; text: string; icon: typeof Wallet }[] = [
  { value: 'ONE_TIME', title: 'Pay all at once', text: 'One payment at the end', icon: Wallet },
  { value: 'EMI', title: 'Monthly EMI', text: 'Small equal payments every month', icon: Repeat },
];

export function LoanConfigStep({ onBack, onApplied }: { onBack?: () => void; onApplied: (loan: LoanDTO) => void }) {
  const [principal, setPrincipal] = useState(100_000);
  const [plan, setPlan] = useState<RepaymentPlan>('ONE_TIME');
  const [tenureDays, setTenureDays] = useState(180);
  const [months, setMonths] = useState(6);
  const [consent, setConsent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Same functions the server uses, so the preview always matches what gets stored.
  const emi = useMemo(() => (plan === 'EMI' ? calculateEmi(principal, months) : null), [plan, principal, months]);
  const quote = useMemo(() => emi ?? calculateLoan(principal, tenureDays), [emi, principal, tenureDays]);

  async function apply() {
    setSubmitting(true);
    setError('');
    try {
      const body = plan === 'EMI' ? { principal, repaymentPlan: plan, emiMonths: months } : { principal, repaymentPlan: plan, tenureDays };
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
      {/* 1. How to repay */}
      <fieldset>
        <legend className="mb-3 text-base font-semibold text-slate-700">How do you want to pay back?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANS.map((p) => {
            const selected = plan === p.value;
            return (
              <label
                key={p.value}
                className={cn(
                  'flex cursor-pointer items-center gap-4 rounded-2xl p-4 ring-2 transition',
                  selected ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
                )}
              >
                <input type="radio" name="plan" className="sr-only" checked={selected} onChange={() => setPlan(p.value)} />
                <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
                  <p.icon className="size-6" />
                </span>
                <span>
                  <span className={cn('block font-bold', selected ? 'text-brand-800' : 'text-slate-800')}>{p.title}</span>
                  <span className="text-sm text-slate-500">{p.text}</span>
                </span>
                {selected && <CheckCircle2 className="ml-auto size-6 text-brand-600" />}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 2. Amount + time */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AmountSlider
          label="How much do you need?"
          icon={<IndianRupee />}
          value={principal}
          min={LOAN_RULES.MIN_PRINCIPAL}
          max={LOAN_RULES.MAX_PRINCIPAL}
          step={LOAN_RULES.PRINCIPAL_STEP}
          buttonStep={10_000}
          format={formatINR}
          presets={AMOUNT_PRESETS}
          onChange={setPrincipal}
        />
        {plan === 'EMI' ? (
          <AmountSlider
            label="In how many months?"
            icon={<CalendarDays />}
            value={months}
            min={EMI_RULES.MIN_MONTHS}
            max={EMI_RULES.MAX_MONTHS}
            step={1}
            buttonStep={1}
            format={(v) => `${v} month${v === 1 ? '' : 's'}`}
            presets={MONTH_PRESETS}
            onChange={setMonths}
          />
        ) : (
          <AmountSlider
            label="For how many days?"
            icon={<CalendarRange />}
            value={tenureDays}
            min={LOAN_RULES.MIN_TENURE_DAYS}
            max={LOAN_RULES.MAX_TENURE_DAYS}
            step={1}
            buttonStep={15}
            format={(v) => `${v} days`}
            presets={TENURE_PRESETS}
            onChange={setTenureDays}
          />
        )}
      </div>

      {/* 3. Live calculation: the numbers that matter, in big type */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-xl shadow-brand-600/20">
        <div className={cn('grid divide-y divide-white/15 sm:divide-x sm:divide-y-0', emi ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <div className="p-6">
            <p className="text-brand-100">You get</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums sm:text-4xl">{formatINR(quote.principal)}</p>
          </div>
          {emi && (
            <div className="bg-white/10 p-6">
              <p className="text-brand-100">You pay every month</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-amber-200 sm:text-4xl">{formatINR(emi.emi)}</p>
              <p className="text-sm text-brand-100">
                for {emi.months} month{emi.months === 1 ? '' : 's'}
              </p>
            </div>
          )}
          <div className="p-6">
            <p className="text-brand-100">You pay back in total</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-300 sm:text-4xl">{formatINR(quote.totalRepayment)}</p>
          </div>
        </div>
        <p className="bg-black/15 px-6 py-3 text-sm text-brand-100">
          Interest: {formatINR(quote.principal)} × 12% × {quote.tenureDays} days ÷ 365 = <strong className="text-white">{formatINR(quote.simpleInterest)}</strong>
          {emi && (
            <>
              {' '}
              · Total ÷ {emi.months} = <strong className="text-white">{formatINR(emi.emi)}</strong> per month
            </>
          )}
        </p>
      </div>

      {/* 4. Key Fact Statement + consent */}
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
