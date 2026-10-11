'use client';

import { useState } from 'react';
import { CheckCircle2, ScrollText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { rejectLoanSchema, type LoanDTO } from '@lms/shared';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { LoanDetails } from '@/components/dashboard/LoanDetails';
import { LoanQueue } from '@/components/dashboard/LoanQueue';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';

function SanctionModal({ loan, close, done }: { loan: LoanDTO; close: () => void; done: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const pending = loan.status === 'APPLIED';

  async function approve() {
    setBusy('approve');
    try {
      await api.patch(`/sanction/loans/${loan.id}/approve`);
      toast.success(`Loan for ${loan.applicant.fullName} approved`);
      done();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  async function reject() {
    const parsed = rejectLoanSchema.safeParse({ reason });
    if (!parsed.success) return setReasonError(parsed.error.issues[0]!.message);
    setBusy('reject');
    try {
      await api.patch(`/sanction/loans/${loan.id}/reject`, parsed.data);
      toast.success(`Loan for ${loan.applicant.fullName} rejected`);
      done();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={pending ? 'Review application' : 'Application details'}
      icon={<ScrollText />}
      footer={
        pending &&
        (rejecting ? (
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={!!busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reject} loading={busy === 'reject'} icon={<XCircle className="size-5" />}>
              Confirm rejection
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setRejecting(true)} disabled={!!busy} icon={<XCircle className="size-5 text-rose-600" />}>
              Reject
            </Button>
            <Button variant="success" onClick={approve} loading={busy === 'approve'} icon={<CheckCircle2 className="size-5" />}>
              Approve loan
            </Button>
          </>
        ))
      }
    >
      <LoanDetails loan={loan} showSlip />
      {rejecting && (
        <div className="mt-6 animate-fade-in">
          <label htmlFor="reason" className="font-semibold text-slate-700">
            Why are you rejecting this loan?
          </label>
          <textarea
            id="reason"
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError('');
            }}
            placeholder="e.g. Salary slip does not match the declared income"
            className="mt-2 w-full rounded-xl p-3 ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-rose-400"
          />
          {reasonError && <p className="mt-1 text-sm font-medium text-rose-600">{reasonError}</p>}
          <p className="mt-1 text-sm text-slate-500">The borrower will see this reason.</p>
        </div>
      )}
    </Modal>
  );
}

export default function SanctionPage() {
  return (
    <>
      <PageHeader module="sanction" />
      <LoanQueue
        module="sanction"
        tabs={[
          { value: 'pending', label: 'Waiting for review', status: 'APPLIED' },
          { value: 'approved', label: 'Approved', status: 'SANCTIONED' },
          { value: 'rejected', label: 'Rejected', status: 'REJECTED' },
        ]}
        actionLabel={(l) => (l.status === 'APPLIED' ? 'Review' : 'View')}
        renderDetail={(loan, close, done) => <SanctionModal loan={loan} close={close} done={done} />}
      />
    </>
  );
}
