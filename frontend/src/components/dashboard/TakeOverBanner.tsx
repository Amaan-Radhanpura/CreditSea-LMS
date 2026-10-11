'use client';

import { useState } from 'react';
import { Hand, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { LoanDTO, UserDTO } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';
import { api, errorMessage } from '@/lib/api';

/**
 * Mirrors the API rule: only the executive a loan is assigned to may act on it.
 * Admin (supervisor override) can always act; an unassigned loan is open to the whole team.
 */
export const canActOn = (loan: LoanDTO, user: UserDTO | null): boolean =>
  !!user && (user.role === 'ADMIN' || !loan.assignee || loan.assignee.id === user.id);

/** Shown to an executive who is not the assignee: explains why actions are locked and offers "Take over". */
export function TakeOverBanner({ loan, module, onTaken }: { loan: LoanDTO; module: 'sanction' | 'disbursement' | 'collection'; onTaken: (l: LoanDTO) => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (canActOn(loan, user)) return null;

  async function takeOver() {
    setBusy(true);
    try {
      const updated = await api.post<LoanDTO>(`/${module}/loans/${loan.id}/take-over`);
      toast.success(`This loan is now assigned to you. ${loan.assignee!.name} has been notified.`);
      onTaken(updated);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center">
      <Lock className="size-6 shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="font-semibold text-amber-900">Assigned to {loan.assignee!.name}</p>
        <p className="text-sm text-amber-800">Only the assigned executive can act on this loan. Take it over if you need to work on it (this is recorded).</p>
      </div>
      <Button variant="secondary" size="sm" loading={busy} onClick={takeOver} icon={<Hand className="size-4" />}>
        Take over
      </Button>
    </div>
  );
}
