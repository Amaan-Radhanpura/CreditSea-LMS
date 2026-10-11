import type { Role } from '@lms/shared';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  SALES: 'Sales executive',
  SANCTION: 'Sanction executive',
  DISBURSEMENT: 'Disbursement executive',
  COLLECTION: 'Collection executive',
  BORROWER: 'Borrower',
};

export const ROLE_TONE: Record<Role, string> = {
  ADMIN: 'bg-slate-900 text-white',
  SALES: 'bg-sky-100 text-sky-800',
  SANCTION: 'bg-amber-100 text-amber-800',
  DISBURSEMENT: 'bg-violet-100 text-violet-800',
  COLLECTION: 'bg-emerald-100 text-emerald-800',
  BORROWER: 'bg-slate-100 text-slate-700',
};

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
