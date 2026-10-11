'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleUserRound, CreditCard, FileText, Pencil, UserRound, Wallet, XCircle } from 'lucide-react';
import { formatINR, type BorrowerStateDTO, type LoanDTO } from '@lms/shared';
import { LoanConfigStep } from '@/components/borrower/LoanConfigStep';
import { Card, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { api, errorMessage } from '@/lib/api';
import { EMPLOYMENT_LABEL } from '@/lib/utils';

const linkBtn = 'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition';

/** Details + documents were collected at sign-up, so applying is just amount + days. */
function SavedSummary({ state }: { state: BorrowerStateDTO }) {
  const p = state.profile!;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-emerald-50 px-5 py-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
      <span className="flex items-center gap-1.5 font-semibold">
        <CheckCircle2 className="size-5 text-emerald-600" /> Your details are saved
      </span>
      <span className="flex items-center gap-1.5">
        <UserRound className="size-4" /> {p.fullName} · {EMPLOYMENT_LABEL[p.employmentMode]} · {formatINR(p.monthlySalary)}/month
      </span>
      <span className="flex items-center gap-1.5">
        <FileText className="size-4" /> Salary slip ✓
      </span>
      <span className="flex items-center gap-1.5">
        <CreditCard className="size-4" /> PAN card ✓
      </span>
      <Link href="/profile" className="ml-auto flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
        <Pencil className="size-4" /> Change
      </Link>
    </div>
  );
}

function Blocked({ state }: { state: BorrowerStateDTO }) {
  const notEligible = state.step === 'NOT_ELIGIBLE';
  return (
    <Card className="mx-auto max-w-2xl text-center animate-fade-in">
      <span className={`mx-auto grid size-20 place-items-center rounded-full ${notEligible ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
        {notEligible ? <XCircle className="size-11" /> : <CircleUserRound className="size-11" />}
      </span>
      <h1 className="mt-5 text-2xl font-extrabold text-slate-900">{notEligible ? "You can't apply right now" : 'Please complete your profile'}</h1>
      {notEligible ? (
        <>
          <p className="mt-2 text-slate-500">Your details don&apos;t meet our loan rules:</p>
          <ul className="mx-auto mt-4 max-w-md space-y-2 text-left">
            {state.profile!.bre.failures.map((f) => (
              <li key={f.rule} className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-rose-700">
                <XCircle className="mt-0.5 size-5 shrink-0" /> {f.message}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-500">If something is wrong, correct it in your profile and you can apply.</p>
        </>
      ) : (
        <p className="mt-2 text-slate-500">
          {state.step === 'DOCUMENTS' ? 'We need both your salary slip and PAN card before you can apply.' : 'We need your personal details before you can apply.'}
        </p>
      )}
      <Link href="/profile" className={`${linkBtn} mt-6 bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700`}>
        <Pencil className="size-5" /> Go to my profile
      </Link>
    </Card>
  );
}

export default function ApplyPage() {
  const router = useRouter();
  const [state, setState] = useState<BorrowerStateDTO | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<LoanDTO | null>(null);

  const load = useCallback(() => {
    setError('');
    api
      .get<BorrowerStateDTO>('/borrower/state')
      .then((s) => (s.step === 'HAS_OPEN_LOAN' ? router.replace('/my-loans') : setState(s)))
      .catch((err) => setError(errorMessage(err)));
  }, [router]);
  useEffect(load, [load]);

  if (applied) {
    return (
      <Card className="mx-auto max-w-lg text-center animate-fade-in">
        <span className="mx-auto grid size-24 place-items-center rounded-full bg-emerald-100 text-emerald-600 animate-pop">
          <CheckCircle2 className="size-14" />
        </span>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-900">Application sent!</h1>
        <p className="mt-2 text-lg text-slate-500">
          We got your request for <strong className="text-slate-800">{formatINR(applied.principal)}</strong>. Our team will check it soon. You will get
          a notification when anything changes.
        </p>
        <Link href="/my-loans" className={`${linkBtn} mt-8 h-14 w-full bg-brand-600 text-lg text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700`}>
          <Wallet className="size-5" /> See my loan
        </Link>
      </Card>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!state) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (state.step !== 'LOAN_CONFIG') return <Blocked state={state} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Apply for a loan</h1>
        <p className="mt-1 text-lg text-slate-500">Just choose how much and for how many days. You will see exactly what you pay back.</p>
      </div>
      <SavedSummary state={state} />
      <Card>
        <LoanConfigStep onApplied={setApplied} />
      </Card>
    </div>
  );
}
