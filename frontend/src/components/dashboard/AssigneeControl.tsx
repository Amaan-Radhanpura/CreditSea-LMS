'use client';

import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_OWNER, type LoanDTO, type Paginated, type UserSummaryDTO } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';
import { api, errorMessage } from '@/lib/api';

/** Shows who owns the loan's current stage; ADMIN can hand it to another executive of that role. */
export function AssigneeControl({ loan, onChange }: { loan: LoanDTO; onChange: (l: LoanDTO) => void }) {
  const { user } = useAuth();
  const stage = STAGE_OWNER[loan.status];
  const [options, setOptions] = useState<UserSummaryDTO[]>([]);
  const [selected, setSelected] = useState(loan.assignee?.id ?? '');
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin || !stage) return;
    api
      .get<Paginated<UserSummaryDTO>>(`/admin/users?role=${stage}&limit=50`)
      .then((r) => setOptions(r.items.filter((u) => u.isActive)))
      .catch(() => setOptions([]));
  }, [isAdmin, stage]);

  if (!stage) return null;

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch<LoanDTO>(`/admin/loans/${loan.id}/assign`, { assigneeId: selected });
      toast.success(`Assigned to ${updated.assignee?.name}`);
      onChange(updated);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100">
      <UserCheck className="size-5 text-indigo-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">Assigned {stage.toLowerCase()} executive</p>
        <p className="font-semibold text-slate-800">{loan.assignee ? `${loan.assignee.name}${loan.assignee.id === user?.id ? ' (you)' : ''}` : 'Not assigned'}</p>
      </div>
      {isAdmin && options.length > 0 && (
        <div className="flex w-full gap-2 sm:w-auto">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 flex-1 rounded-xl bg-white px-3 ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Choose executive"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.loanCount} open
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" className="h-10" loading={saving} disabled={!selected || selected === loan.assignee?.id} onClick={save}>
            Re-assign
          </Button>
        </div>
      )}
    </div>
  );
}
