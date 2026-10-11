'use client';

import { useState } from 'react';
import { Landmark, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR, type LoanDTO } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { LoanDetails } from '@/components/dashboard/LoanDetails';
import { TakeOverBanner, canActOn } from '@/components/dashboard/TakeOverBanner';
import { LoanQueue } from '@/components/dashboard/LoanQueue';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';

function DisburseModal({ loan: initial, close, done }: { loan: LoanDTO; close: () => void; done: () => void }) {
  const [loan, setLoan] = useState(initial);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const ready = loan.status === 'SANCTIONED' && canActOn(loan, user);

  async function disburse() {
    setBusy(true);
    try {
      await api.patch(`/disbursement/loans/${loan.id}/disburse`);
      toast.success(`${formatINR(loan.principal)} released to ${loan.applicant.fullName}`);
      done();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={ready ? 'Release funds' : 'Loan details'}
      icon={<Landmark />}
      footer={
        ready && (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={disburse} loading={busy} icon={<Send className="size-5" />}>
              Mark {formatINR(loan.principal)} as disbursed
            </Button>
          </>
        )
      }
    >
      {ready && (
        <p className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-amber-800 ring-1 ring-amber-200">
          Confirm only after the money has been sent to the borrower&apos;s bank account. This cannot be undone.
        </p>
      )}
      {loan.status === 'SANCTIONED' && <TakeOverBanner loan={loan} module="disbursement" onTaken={setLoan} />}
      <LoanDetails key={loan.assignee?.id} loan={loan} showSlip={user?.role === 'ADMIN'} />
    </Modal>
  );
}

export default function DisbursementPage() {
  return (
    <>
      <PageHeader module="disbursement" />
      <LoanQueue
        module="disbursement"
        tabs={[
          { value: 'ready', label: 'Ready to disburse', status: 'SANCTIONED' },
          { value: 'disbursed', label: 'Disbursed', status: 'DISBURSED' },
        ]}
        actionLabel={(l) => (l.status === 'SANCTIONED' ? 'Disburse' : 'View')}
        renderDetail={(loan, close, done) => <DisburseModal loan={loan} close={close} done={done} />}
      />
    </>
  );
}
