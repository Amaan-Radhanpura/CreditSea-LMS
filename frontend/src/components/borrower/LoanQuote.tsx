'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, CheckCircle2, IndianRupee, Repeat, Wallet } from 'lucide-react';
import { EMI_RULES, LOAN_RULES, calculateEmi, calculateLoan, formatINR, type EmiQuote, type LoanQuote as Quote, type RepaymentPlan } from '@lms/shared';
import { cn } from '@/lib/utils';
import { AmountSlider } from './AmountSlider';

/**
 * Loan amount / plan / duration inputs and the live result panel, shared by the Home calculator and
 * the Apply screen. Both use the same maths functions as the server, so the numbers always match.
 */

const AMOUNT_PRESETS = [50_000, 100_000, 200_000, 500_000].map((v) => ({ value: v, label: v >= 100_000 ? `₹${v / 100_000}L` : `₹${v / 1000}K` }));
const TENURE_PRESETS = [30, 90, 180, 365].map((v) => ({ value: v, label: `${v} days` }));
const MONTH_PRESETS = [3, 6, 9, 12].map((v) => ({ value: v, label: `${v} months` }));

const PLANS: { value: RepaymentPlan; title: string; text: string; icon: typeof Wallet }[] = [
  { value: 'ONE_TIME', title: 'Pay all at once', text: 'One payment at the end', icon: Wallet },
  { value: 'EMI', title: 'Monthly EMI', text: 'Small equal payments every month', icon: Repeat },
];

export interface LoanQuoteInput {
  principal: number;
  plan: RepaymentPlan;
  tenureDays: number;
  months: number;
}

export const DEFAULT_QUOTE_INPUT: LoanQuoteInput = { principal: 100_000, plan: 'ONE_TIME', tenureDays: 180, months: 6 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Reads a calculator choice from URL params (e.g. /apply?amount=200000&plan=EMI&months=6), falling back to defaults. */
export function quoteInputFromParams(params: URLSearchParams): LoanQuoteInput {
  const num = (k: string, fallback: number) => {
    const n = Number(params.get(k));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const d = DEFAULT_QUOTE_INPUT;
  return {
    principal: clamp(Math.round(num('amount', d.principal) / LOAN_RULES.PRINCIPAL_STEP) * LOAN_RULES.PRINCIPAL_STEP, LOAN_RULES.MIN_PRINCIPAL, LOAN_RULES.MAX_PRINCIPAL),
    plan: params.get('plan') === 'EMI' ? 'EMI' : 'ONE_TIME',
    tenureDays: clamp(Math.round(num('days', d.tenureDays)), LOAN_RULES.MIN_TENURE_DAYS, LOAN_RULES.MAX_TENURE_DAYS),
    months: clamp(Math.round(num('months', d.months)), EMI_RULES.MIN_MONTHS, EMI_RULES.MAX_MONTHS),
  };
}

export const quoteInputToParams = (q: LoanQuoteInput): string =>
  new URLSearchParams({
    amount: String(q.principal),
    plan: q.plan,
    ...(q.plan === 'EMI' ? { months: String(q.months) } : { days: String(q.tenureDays) }),
  }).toString();

export function useLoanQuote(initial: LoanQuoteInput = DEFAULT_QUOTE_INPUT) {
  const [input, setInput] = useState(initial);
  const emi: EmiQuote | null = useMemo(() => (input.plan === 'EMI' ? calculateEmi(input.principal, input.months) : null), [input]);
  const quote: Quote = useMemo(() => emi ?? calculateLoan(input.principal, input.tenureDays), [emi, input]);
  const set = <K extends keyof LoanQuoteInput>(key: K) => (value: LoanQuoteInput[K]) => setInput((s) => ({ ...s, [key]: value }));
  return { input, set, quote, emi };
}

export type LoanQuoteState = ReturnType<typeof useLoanQuote>;

export function LoanQuoteInputs({ q, name = 'plan' }: { q: LoanQuoteState; name?: string }) {
  const { input, set } = q;
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-base font-semibold text-slate-700">How do you want to pay back?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANS.map((p) => {
            const selected = input.plan === p.value;
            return (
              <label
                key={p.value}
                className={cn(
                  'flex cursor-pointer items-center gap-4 rounded-2xl p-4 ring-2 transition',
                  selected ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
                )}
              >
                <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => set('plan')(p.value)} />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <AmountSlider
          label="How much do you need?"
          icon={<IndianRupee />}
          value={input.principal}
          min={LOAN_RULES.MIN_PRINCIPAL}
          max={LOAN_RULES.MAX_PRINCIPAL}
          step={LOAN_RULES.PRINCIPAL_STEP}
          buttonStep={10_000}
          format={formatINR}
          presets={AMOUNT_PRESETS}
          onChange={set('principal')}
        />
        {input.plan === 'EMI' ? (
          <AmountSlider
            label="In how many months?"
            icon={<CalendarDays />}
            value={input.months}
            min={EMI_RULES.MIN_MONTHS}
            max={EMI_RULES.MAX_MONTHS}
            step={1}
            buttonStep={1}
            format={(v) => `${v} month${v === 1 ? '' : 's'}`}
            presets={MONTH_PRESETS}
            onChange={set('months')}
          />
        ) : (
          <AmountSlider
            label="For how many days?"
            icon={<CalendarRange />}
            value={input.tenureDays}
            min={LOAN_RULES.MIN_TENURE_DAYS}
            max={LOAN_RULES.MAX_TENURE_DAYS}
            step={1}
            buttonStep={15}
            format={(v) => `${v} days`}
            presets={TENURE_PRESETS}
            onChange={set('tenureDays')}
          />
        )}
      </div>
    </div>
  );
}

/** The numbers that matter, in big type: you get / every month (EMI) / total, plus the working. */
export function QuotePanel({ q }: { q: LoanQuoteState }) {
  const { quote, emi } = q;
  return (
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
  );
}
