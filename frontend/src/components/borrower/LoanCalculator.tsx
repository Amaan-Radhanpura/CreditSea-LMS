'use client';

import Link from 'next/link';
import { ArrowRight, Calculator, CalendarClock, Info } from 'lucide-react';
import { formatINR } from '@lms/shared';
import { Card } from '@/components/ui/Feedback';
import { LoanQuoteInputs, QuotePanel, quoteInputToParams, useLoanQuote } from './LoanQuote';

/**
 * "Try before you apply": same maths as the real application, no commitment.
 * `canApply` shows the button that carries the chosen numbers into the Apply screen.
 */
export function LoanCalculator({ canApply }: { canApply: boolean }) {
  const q = useLoanQuote();
  const { input, quote, emi } = q;

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
          <Calculator className="size-6 text-brand-600" /> Loan calculator
        </h2>
        <p className="mt-1 text-slate-500">See exactly what you will pay before you apply. Nothing is saved.</p>
      </div>

      <LoanQuoteInputs q={q} name="calculator-plan" />
      <QuotePanel q={q} />

      {/* Breakdown */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Loan amount', value: formatINR(quote.principal) },
          { label: 'Total interest (12% p.a.)', value: formatINR(quote.simpleInterest) },
          { label: 'Total to pay back', value: formatINR(quote.totalRepayment) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {emi ? (
        <div>
          <p className="mb-3 flex items-center gap-2 font-semibold text-slate-700">
            <CalendarClock className="size-5 text-brand-600" /> Your monthly EMIs
          </p>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {emi.instalments.map((amount, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl px-4 py-2.5 ring-1 ring-slate-200">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
                <span className="text-sm text-slate-500">Month {i + 1}</span>
                <span className="ml-auto font-bold text-slate-900 tabular-nums">{formatINR(amount)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 size-3.5 shrink-0" /> The first EMI is due 30 days after the money reaches your account. The last EMI may differ by a few paise so the total is exact.
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-slate-600 ring-1 ring-slate-100">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <span>
            One payment of <strong className="text-slate-900">{formatINR(quote.totalRepayment)}</strong>, due {input.tenureDays} days after the money reaches your
            account.
          </span>
        </p>
      )}

      {canApply && (
        <div className="flex justify-end">
          <Link
            href={`/apply?${quoteInputToParams(input)}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700"
          >
            Apply with these numbers <ArrowRight className="size-5" />
          </Link>
        </div>
      )}
    </Card>
  );
}
