'use client';

import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { changePasswordSchema, type UserDTO } from '@lms/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { ApiClientError, api, errorMessage } from '@/lib/api';

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

export function PasswordCard() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse(form);
    const next: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message]));
    if (form.newPassword && form.confirm !== form.newPassword) next.confirm = 'The two new passwords do not match';
    if (!parsed.success || Object.keys(next).length) return setErrors(next);

    setErrors({});
    setSaving(true);
    try {
      await api.post<{ user: UserDTO }>('/auth/change-password', parsed.data);
      setForm(EMPTY);
      toast.success('Password changed. You were logged out on all other devices.');
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <KeyRound className="size-5 text-brand-600" /> Change password
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
        <ShieldCheck className="size-4" /> For your safety, you will be logged out on every other device.
      </p>
      <form onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="Current password" icon={<Lock />} type="password" autoComplete="current-password" value={form.currentPassword} error={errors.currentPassword} onChange={set('currentPassword')} />
        <Field label="New password" icon={<KeyRound />} type="password" autoComplete="new-password" hint="8+ characters, a letter and a number" value={form.newPassword} error={errors.newPassword} onChange={set('newPassword')} />
        <Field label="Repeat new password" icon={<KeyRound />} type="password" autoComplete="new-password" value={form.confirm} error={errors.confirm} onChange={set('confirm')} />
        <div className="sm:col-span-3 sm:flex sm:justify-end">
          <Button type="submit" loading={saving} className="w-full sm:w-auto" icon={<KeyRound className="size-5" />}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
