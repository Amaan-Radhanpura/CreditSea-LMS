'use client';

import { useState } from 'react';
import { Lock, Mail, Pencil, Save, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { updateAccountSchema, type UserDTO } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';
import { formatDate } from '@/lib/utils';

function ReadOnly({ icon: Icon, label, value, hint }: { icon: typeof Mail; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="size-4" /> {label}
      </p>
      <p className="mt-1 font-semibold break-words text-slate-800">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
        <Lock className="size-3" /> {hint}
      </p>
    </div>
  );
}

/** Name is editable; email (login identity) and role (admin-controlled) are shown read-only. */
export function AccountCard() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = updateAccountSchema.safeParse({ name });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setSaving(true);
    try {
      const res = await api.patch<{ user: UserDTO }>('/auth/me', parsed.data);
      updateUser(res.user);
      setEditing(false);
      setError('');
      toast.success('Your name is updated');
    } catch (err) {
      setError(err instanceof ApiClientError ? (err.fieldErrors.name ?? err.message) : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <UserRound className="size-5 text-brand-600" /> Account
        </h2>
        {!editing && (
          <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            Edit name
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} noValidate className="mt-5 space-y-4">
          <Field label="Your name" icon={<UserRound />} value={name} error={error} autoFocus onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setName(user.name);
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} icon={<Save className="size-5" />}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-2xl font-extrabold text-slate-900">{user.name}</p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ReadOnly icon={Mail} label="Email (login)" value={user.email} hint="Used to log in" />
        <ReadOnly icon={ShieldCheck} label="Role" value={ROLE_LABEL[user.role]} hint="Set by admin" />
        <ReadOnly icon={UserRound} label="Member since" value={formatDate(user.createdAt)} hint="Account created" />
      </div>
    </Card>
  );
}
