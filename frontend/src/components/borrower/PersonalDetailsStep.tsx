'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Briefcase, CalendarDays, CheckCircle2, CircleDashed, CreditCard, IndianRupee, Store, UserRound, UserX, XCircle } from 'lucide-react';
import { BRE_RULES, PAN_REGEX, calculateAge, normalizePan, profileSchema, runBre, type BorrowerStateDTO, type BreFailure, type EmploymentMode, type ProfileDTO, type ProfileInput } from '@lms/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ApiClientError, api } from '@/lib/api';
import { cn, todayISO } from '@/lib/utils';

const MODES: { value: EmploymentMode; label: string; icon: typeof Briefcase }[] = [
  { value: 'SALARIED', label: 'I have a job', icon: Briefcase },
  { value: 'SELF_EMPLOYED', label: 'I run a business', icon: Store },
  { value: 'UNEMPLOYED', label: 'No work right now', icon: UserX },
];

const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 9);
const withCommas = (digits: string) => (digits ? Number(digits).toLocaleString('en-IN') : '');

/**
 * Personal details form with a live eligibility checklist.
 *  - with `onDone`: saves to the server (profile page) and reports the new borrower state
 *  - with `onValid`: only validates and hands the data back (sign-up wizard; saved with the account)
 */
export function PersonalDetailsStep({
  profile,
  initial,
  onDone,
  onValid,
  submitLabel = 'Next',
  secondaryAction,
}: {
  profile: ProfileDTO | null;
  initial?: Partial<ProfileInput>;
  onDone?: (s: BorrowerStateDTO) => void;
  onValid?: (data: ProfileInput) => void;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
}) {
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? initial?.fullName ?? '',
    pan: profile?.pan ?? initial?.pan ?? '',
    dob: profile?.dob ?? initial?.dob ?? '',
    salary: profile ? String(profile.monthlySalary) : initial?.monthlySalary !== undefined ? String(initial.monthlySalary) : '',
    employmentMode: (profile?.employmentMode ?? initial?.employmentMode ?? '') as EmploymentMode | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverFailures, setServerFailures] = useState<BreFailure[]>(
    profile && !profile.bre.passed ? profile.bre.failures : [],
  );
  const [saving, setSaving] = useState(false);

  // Live eligibility checklist, using the same BRE function the server runs.
  const checks = useMemo(() => {
    const age = form.dob ? calculateAge(form.dob) : null;
    const salary = form.salary ? Number(form.salary) : null;
    const pan = normalizePan(form.pan);
    return [
      { label: `Age ${BRE_RULES.MIN_AGE} to ${BRE_RULES.MAX_AGE} years`, ok: age === null ? null : age >= BRE_RULES.MIN_AGE && age <= BRE_RULES.MAX_AGE },
      { label: 'Salary ₹25,000 or more', ok: salary === null ? null : salary >= BRE_RULES.MIN_MONTHLY_SALARY },
      { label: 'Valid PAN number', ok: pan.length < 10 ? null : PAN_REGEX.test(pan) },
      { label: 'Have a job or business', ok: form.employmentMode ? form.employmentMode !== 'UNEMPLOYED' : null },
    ];
  }, [form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerFailures([]);
    const input = { ...form, monthlySalary: form.salary === '' ? undefined : Number(form.salary) };
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0] === 'monthlySalary' ? 'salary' : String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    if (onValid) return onValid(parsed.data);
    setSaving(true);
    try {
      onDone?.(await api.put<BorrowerStateDTO>('/borrower/profile', parsed.data));
      toast.success('Great news! You can apply for a loan.');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'BRE_REJECTED') {
        setServerFailures((err.details as { failures: BreFailure[] }).failures);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors);
      } else {
        setErrors({ form: err instanceof Error ? err.message : 'Could not save. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  }

  // Shown only as a preview; the server decides.
  const preview = form.dob && form.salary && form.pan.length === 10 && form.employmentMode
    ? runBre({ dob: form.dob, monthlySalary: Number(form.salary), pan: form.pan, employmentMode: form.employmentMode })
    : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {serverFailures.length > 0 && (
        <div role="alert" className="rounded-3xl bg-rose-50 p-5 ring-1 ring-rose-200 animate-fade-in">
          <p className="flex items-center gap-2 text-lg font-bold text-rose-700">
            <XCircle className="size-6" /> Sorry, you can&apos;t get a loan right now
          </p>
          <ul className="mt-3 space-y-2">
            {serverFailures.map((f) => (
              <li key={f.rule} className="flex items-start gap-2 text-rose-700">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-rose-500" /> {f.message}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-rose-600">If something is wrong, fix it below and try again.</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name (as on PAN)" icon={<UserRound />} placeholder="e.g. Ramesh Kumar" value={form.fullName} error={errors.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <Field
          label="PAN number"
          icon={<CreditCard />}
          placeholder="ABCDE1234F"
          hint="10 characters: 5 letters, 4 numbers, 1 letter"
          maxLength={10}
          autoCapitalize="characters"
          className="font-mono tracking-widest uppercase"
          value={form.pan}
          error={errors.pan}
          onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
        />
        <Field label="Date of birth" icon={<CalendarDays />} type="date" max={todayISO()} value={form.dob} error={errors.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
        <Field
          label="Monthly salary"
          icon={<IndianRupee />}
          prefix="₹"
          inputMode="numeric"
          placeholder="25,000"
          value={withCommas(form.salary)}
          error={errors.salary}
          onChange={(e) => setForm({ ...form, salary: digitsOnly(e.target.value) })}
        />
      </div>

      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-700">
          <Briefcase className="size-5 text-brand-600" /> What work do you do?
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map(({ value, label, icon: Icon }) => {
            const selected = form.employmentMode === value;
            return (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-2xl p-4 ring-2 transition sm:flex-col sm:py-5 sm:text-center',
                  selected ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
                )}
              >
                <input type="radio" name="employmentMode" value={value} checked={selected} onChange={() => setForm({ ...form, employmentMode: value })} className="sr-only" />
                <span className={cn('grid size-12 place-items-center rounded-xl', selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
                  <Icon className="size-6" />
                </span>
                <span className={cn('font-semibold', selected ? 'text-brand-800' : 'text-slate-700')}>{label}</span>
              </label>
            );
          })}
        </div>
        {errors.employmentMode && <p className="mt-2 text-sm font-medium text-rose-600">{errors.employmentMode}</p>}
      </fieldset>

      <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
        <p className="mb-3 font-semibold text-slate-700">Can I get a loan?</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              {c.ok === null ? <CircleDashed className="size-5 text-slate-300" /> : c.ok ? <CheckCircle2 className="size-5 text-emerald-500" /> : <XCircle className="size-5 text-rose-500" />}
              <span className={cn(c.ok === false ? 'text-rose-700' : 'text-slate-600')}>{c.label}</span>
            </li>
          ))}
        </ul>
        {preview && (
          <p className={cn('mt-3 text-sm font-semibold', preview.passed ? 'text-emerald-700' : 'text-rose-700')}>
            {preview.passed ? 'Looks good! Tap Next to continue.' : 'Some checks are not met. You can still submit and we will confirm.'}
          </p>
        )}
      </div>

      {errors.form && <p className="font-medium text-rose-600">{errors.form}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {secondaryAction ?? <span />}
        <Button type="submit" size="lg" loading={saving} className="w-full sm:w-auto">
          {submitLabel} <ArrowRight className="size-5" />
        </Button>
      </div>
    </form>
  );
}
