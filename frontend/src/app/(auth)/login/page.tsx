'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Briefcase, Crown, HandCoins, Landmark, LogIn, Mail, Lock, ScrollText, Megaphone, User } from 'lucide-react';
import { loginSchema, type Role, type UserDTO } from '@lms/shared';
import { AuthShell } from '@/components/AuthShell';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ApiClientError, api } from '@/lib/api';

const DEMO_PASSWORD = 'Password@123';
const DEMO_ACCOUNTS: { role: Role; label: string; icon: typeof User }[] = [
  { role: 'BORROWER', label: 'Borrower', icon: User },
  { role: 'ADMIN', label: 'Admin', icon: Crown },
  { role: 'SALES', label: 'Sales', icon: Megaphone },
  { role: 'SANCTION', label: 'Sanction', icon: ScrollText },
  { role: 'DISBURSEMENT', label: 'Disbursement', icon: Landmark },
  { role: 'COLLECTION', label: 'Collection', icon: HandCoins },
];

function LoginForm() {
  const { signedIn } = useAuth();
  const next = useSearchParams().get('next');
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(values: typeof form) {
    setFormError('');
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { user } = await api.post<{ user: UserDTO }>('/auth/login', parsed.data);
      signedIn(user, next);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Could not log in. Please try again.');
      setLoading(false);
    }
  }

  return (
    <>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void login(form);
        }}
      >
        <Field label="Email" icon={<Mail />} type="email" autoComplete="email" placeholder="you@example.com" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password" icon={<Lock />} type="password" autoComplete="current-password" placeholder="Your password" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {formError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 font-medium text-rose-700 ring-1 ring-rose-100">{formError}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading} icon={<LogIn className="size-5" />}>
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-slate-600">
        New here?{' '}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-10 rounded-3xl bg-slate-100/80 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Briefcase className="size-4" /> Demo accounts: tap one to log in (password {DEMO_PASSWORD})
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMO_ACCOUNTS.map(({ role, label, icon: Icon }) => (
            <button
              key={role}
              type="button"
              disabled={loading}
              onClick={() => {
                const creds = { email: `${role.toLowerCase()}@lms.dev`, password: DEMO_PASSWORD };
                setForm(creds);
                void login(creds);
              }}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:ring-brand-300 hover:text-brand-700 disabled:opacity-50"
            >
              <Icon className="size-4 text-brand-600" /> {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back 👋" subtitle="Log in to continue">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
