'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CreditCard, FileText, KeyRound, Lock, Mail, UserPlus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { registerSchema, type BreResult, type ProfileInput, type UserDTO } from '@lms/shared';
import { AuthShell } from '@/components/AuthShell';
import { useAuth } from '@/components/AuthProvider';
import { DocumentPicker } from '@/components/borrower/DocumentPicker';
import { PersonalDetailsStep } from '@/components/borrower/PersonalDetailsStep';
import { Stepper, type StepDef } from '@/components/borrower/Stepper';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ApiClientError, api } from '@/lib/api';

const STEPS: StepDef[] = [
  { label: 'Account', icon: KeyRound },
  { label: 'About you', icon: UserRound },
  { label: 'Documents', icon: FileText },
];

const SUBTITLES = [
  'Step 1: your login details',
  'Step 2: we check if you can get a loan',
  'Step 3: upload two documents, and you are done',
];

type DocKey = 'salarySlip' | 'panCard';

/**
 * Sign-up collects everything once: account, personal details and both documents.
 * Nothing is saved until the last step, then it is all sent together and stored in one transaction.
 */
export default function RegisterPage() {
  const { signedIn } = useAuth();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState({ name: '', email: '', password: '' });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<ProfileInput | null>(null);
  const [files, setFiles] = useState<Record<DocKey, File | null>>({ salarySlip: null, panCard: null });
  const [fileErrors, setFileErrors] = useState<Record<DocKey, string>>({ salarySlip: '', panCard: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function nextFromAccount(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(account);
    if (!parsed.success) return setAccountErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
    setAccountErrors({});
    setStep(1);
  }

  async function createAccount() {
    const missing = { salarySlip: files.salarySlip ? '' : 'Please add your salary slip', panCard: files.panCard ? '' : 'Please add your PAN card' };
    if (missing.salarySlip || missing.panCard) return setFileErrors(missing);
    if (!details) return setStep(1);

    const body = new FormData();
    const parsedAccount = registerSchema.parse(account);
    for (const [k, v] of Object.entries({ ...parsedAccount, ...details })) body.append(k, String(v));
    body.append('salarySlip', files.salarySlip!);
    body.append('panCard', files.panCard!);

    setFormError('');
    setSubmitting(true);
    try {
      const { user, bre } = await api.post<{ user: UserDTO; bre: BreResult }>('/auth/register', body);
      if (bre.passed) toast.success('Account created! You can now apply for a loan.');
      else toast.warning('Account created, but you are not eligible for a loan right now.');
      signedIn(user);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiClientError && err.code === 'EMAIL_TAKEN') {
        setAccountErrors({ email: err.message });
        setStep(0);
      } else if (err instanceof ApiClientError && err.code === 'PAN_TAKEN') {
        setFormError(err.message);
        setStep(1);
      } else if (err instanceof ApiClientError && (err.fieldErrors.salarySlip || err.fieldErrors.panCard)) {
        setFileErrors({ salarySlip: err.fieldErrors.salarySlip ?? '', panCard: err.fieldErrors.panCard ?? '' });
      } else {
        setFormError(err instanceof Error ? err.message : 'Could not create your account.');
      }
    }
  }

  const setDoc = (key: DocKey) => (file: File | null, error: string) => {
    setFiles((f) => ({ ...f, [key]: file }));
    setFileErrors((e) => ({ ...e, [key]: error }));
  };

  return (
    <AuthShell title="Create your account" subtitle={SUBTITLES[step]!} wide>
      <div className="mb-8">
        <Stepper steps={STEPS} current={step} maxReached={details ? 2 : step} onSelect={(i) => i <= step && setStep(i)} />
      </div>

      {formError && (
        <p role="alert" className="mb-5 rounded-xl bg-rose-50 px-4 py-3 font-medium text-rose-700 ring-1 ring-rose-100">
          {formError}
        </p>
      )}

      {step === 0 && (
        <form className="space-y-5 animate-fade-in" noValidate onSubmit={nextFromAccount}>
          <Field label="Your name" icon={<UserRound />} autoComplete="name" placeholder="e.g. Ramesh Kumar" value={account.name} error={accountErrors.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />
          <Field label="Email" icon={<Mail />} type="email" autoComplete="email" placeholder="you@example.com" value={account.email} error={accountErrors.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
          <Field
            label="Password"
            icon={<Lock />}
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            hint="Use at least 8 characters with a letter and a number"
            value={account.password}
            error={accountErrors.password}
            onChange={(e) => setAccount({ ...account, password: e.target.value })}
          />
          <Button type="submit" size="lg" className="w-full">
            Next <ArrowRight className="size-5" />
          </Button>
        </form>
      )}

      {step === 1 && (
        <div className="animate-fade-in">
          <PersonalDetailsStep
            profile={null}
            initial={details ?? { fullName: account.name }}
            submitLabel="Next"
            onValid={(d) => {
              setDetails(d);
              setFormError('');
              setStep(2);
            }}
            secondaryAction={
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep(0)}>
                <ArrowLeft className="size-5" /> Back
              </Button>
            }
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-fade-in">
          <DocumentPicker
            label="Salary slip"
            hint="Your latest salary slip · PDF, JPG or PNG · max 5 MB"
            icon={<FileText />}
            file={files.salarySlip}
            error={fileErrors.salarySlip}
            onPick={setDoc('salarySlip')}
          />
          <DocumentPicker
            label="PAN card"
            hint="A clear photo or scan of your PAN card · max 5 MB"
            icon={<CreditCard />}
            file={files.panCard}
            error={fileErrors.panCard}
            onPick={setDoc('panCard')}
          />
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            🔒 Your documents are private. Only you and our loan team can see them.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep(1)} disabled={submitting}>
              <ArrowLeft className="size-5" /> Back
            </Button>
            <Button size="lg" variant="success" loading={submitting} onClick={createAccount} icon={<UserPlus className="size-5" />}>
              Create account
            </Button>
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
