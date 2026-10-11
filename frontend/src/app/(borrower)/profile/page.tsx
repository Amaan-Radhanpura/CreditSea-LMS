'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarDays, CheckCircle2, CircleUserRound, CreditCard, FileText, IndianRupee, Lock, Pencil, UserRound, XCircle } from 'lucide-react';
import { DOCUMENT_KINDS, DOCUMENT_LABEL, formatINR, calculateAge, type BorrowerStateDTO, type DocumentKind } from '@lms/shared';
import { PersonalDetailsStep } from '@/components/borrower/PersonalDetailsStep';
import { DocumentUploader } from '@/components/borrower/DocumentUploader';
import { AccountCard } from '@/components/profile/AccountCard';
import { PasswordCard } from '@/components/profile/PasswordCard';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { api, errorMessage } from '@/lib/api';
import { EMPLOYMENT_LABEL, cn, formatBytes, formatDate, formatDateTime } from '@/lib/utils';

function Item({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" />
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="font-semibold break-words text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function LockedNote() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
      <Lock className="mt-0.5 size-4 shrink-0" />
      You have a loan in progress, so these details are locked. They were saved with your application. You can change them after the loan is closed.
    </p>
  );
}

export default function BorrowerProfilePage() {
  const [state, setState] = useState<BorrowerStateDTO | null>(null);
  const [error, setError] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [replacing, setReplacing] = useState<DocumentKind | null>(null);

  const load = useCallback(() => {
    setError('');
    api.get<BorrowerStateDTO>('/borrower/state').then(setState).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const locked = state?.step === 'HAS_OPEN_LOAN';
  const profile = state?.profile;

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-3xl font-extrabold text-slate-900">
        <CircleUserRound className="size-8 text-brand-600" /> My profile
      </h1>

      <AccountCard />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !state ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <UserRound className="size-5 text-brand-600" /> Personal details
              </h2>
              {profile && !locked && !editingDetails && (
                <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditingDetails(true)}>
                  Edit details
                </Button>
              )}
            </div>

            {editingDetails ? (
              <div className="mt-5">
                <PersonalDetailsStep
                  profile={profile ?? null}
                  submitLabel="Save details"
                  onDone={(s) => {
                    setState(s);
                    setEditingDetails(false);
                  }}
                />
                <Button variant="ghost" className="mt-2" onClick={() => setEditingDetails(false)}>
                  Cancel
                </Button>
              </div>
            ) : !profile ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-6 text-center">
                <p className="font-semibold text-slate-700">Not added yet</p>
                <p className="mx-auto mt-1 max-w-md text-slate-500">
                  Sign-up only asks for your name, email and password. Add your PAN, date of birth, salary and work type once, and
                  every future loan only needs the amount and days.
                </p>
                <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                  <Button icon={<Pencil className="size-4" />} onClick={() => setEditingDetails(true)}>
                    Add details here
                  </Button>
                  <Link href="/apply" className="inline-flex h-11 items-center justify-center rounded-xl px-5 font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                    Apply for a loan
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Item icon={UserRound} label="Full name (as on PAN)" value={profile.fullName} />
                  <Item icon={CreditCard} label="PAN" value={<span className="font-mono tracking-wider">{profile.pan}</span>} />
                  <Item icon={CalendarDays} label="Date of birth" value={`${formatDate(profile.dob)} (${calculateAge(profile.dob)} years)`} />
                  <Item icon={IndianRupee} label="Monthly salary" value={formatINR(profile.monthlySalary)} />
                  <Item icon={Briefcase} label="Work" value={EMPLOYMENT_LABEL[profile.employmentMode]} />
                  <div
                    className={cn(
                      'flex items-start gap-3 rounded-2xl p-4',
                      profile.bre.passed ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800',
                    )}
                  >
                    {profile.bre.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <XCircle className="mt-0.5 size-5 shrink-0" />}
                    <div>
                      <p className="text-sm opacity-80">Loan eligibility</p>
                      <p className="font-semibold">{profile.bre.passed ? 'You are eligible' : 'Not eligible right now'}</p>
                      <p className="text-xs opacity-70">Checked {formatDateTime(profile.bre.checkedAt)}</p>
                    </div>
                  </div>
                </div>
                {!profile.bre.passed && (
                  <ul className="mt-3 space-y-1 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
                    {profile.bre.failures.map((f) => (
                      <li key={f.rule}>• {f.message}</li>
                    ))}
                  </ul>
                )}
                {locked && <LockedNote />}
              </>
            )}
          </Card>

          {profile && (
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <FileText className="size-5 text-brand-600" /> My documents
              </h2>
              <p className="mt-1 text-sm text-slate-500">Private. Only you and our loan team can open them.</p>
              <div className="mt-5 space-y-4">
                {DOCUMENT_KINDS.map((kind) => {
                  const doc = kind === 'PAN_CARD' ? profile.panCard : profile.salarySlip;
                  const Icon = kind === 'PAN_CARD' ? CreditCard : FileText;
                  return (
                    <div key={kind} className="rounded-2xl ring-1 ring-slate-200">
                      {replacing === kind ? (
                        <div className="p-4">
                          <DocumentUploader
                            kind={kind}
                            onCancel={() => setReplacing(null)}
                            onDone={(s) => {
                              setState(s);
                              setReplacing(null);
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 p-4">
                          <span className={cn('grid size-11 place-items-center rounded-xl', doc ? 'bg-brand-50 text-brand-600' : 'bg-rose-50 text-rose-500')}>
                            <Icon className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-slate-800">{DOCUMENT_LABEL[kind]}</span>
                            {doc ? (
                              <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm text-brand-700 hover:underline">
                                {doc.originalName} · {formatBytes(doc.size)} · uploaded {formatDateTime(doc.uploadedAt)}
                              </a>
                            ) : (
                              <span className="text-sm font-medium text-rose-600">Missing: needed before you can apply</span>
                            )}
                          </span>
                          {!locked && (
                            <Button variant={doc ? 'secondary' : 'primary'} size="sm" onClick={() => setReplacing(kind)}>
                              {doc ? 'Replace' : 'Upload'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {locked && <LockedNote />}
            </Card>
          )}
        </>
      )}

      <PasswordCard />
    </div>
  );
}
