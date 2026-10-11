export const ROLES = ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION', 'BORROWER'] as const;
export type Role = (typeof ROLES)[number];

/** Executive roles that work inside the operations dashboard. */
export const EXECUTIVE_ROLES = ['SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const;
export type ExecutiveRole = (typeof EXECUTIVE_ROLES)[number];

export const LOAN_STATUSES = ['APPLIED', 'SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED'] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** Statuses in which a loan still "occupies" the borrower (only one allowed at a time). */
export const OPEN_LOAN_STATUSES: readonly LoanStatus[] = ['APPLIED', 'SANCTIONED', 'DISBURSED'];

export const EMPLOYMENT_MODES = ['SALARIED', 'SELF_EMPLOYED', 'UNEMPLOYED'] as const;
export type EmploymentMode = (typeof EMPLOYMENT_MODES)[number];

/** Dashboard modules and the executive role that owns each one. ADMIN can open all of them. */
export const DASHBOARD_MODULES = {
  sales: 'SALES',
  sanction: 'SANCTION',
  disbursement: 'DISBURSEMENT',
  collection: 'COLLECTION',
} as const satisfies Record<string, ExecutiveRole>;
export type DashboardModule = keyof typeof DASHBOARD_MODULES;

export const LOAN_RULES = {
  MIN_PRINCIPAL: 50_000,
  MAX_PRINCIPAL: 500_000,
  PRINCIPAL_STEP: 1_000,
  MIN_TENURE_DAYS: 30,
  MAX_TENURE_DAYS: 365,
  /** Annual interest rate in percent (simple interest). */
  INTEREST_RATE: 12,
} as const;

export const REPAYMENT_PLANS = ['ONE_TIME', 'EMI'] as const;
export type RepaymentPlan = (typeof REPAYMENT_PLANS)[number];

/**
 * Monthly EMI option. A "month" is 30 days, so 12 EMIs = 360 days, inside the 30-365 day tenure rule.
 * Interest is still the assignment's simple interest on the whole tenure (flat EMI): the total never changes,
 * it is only split into equal instalments.
 */
export const EMI_RULES = {
  MIN_MONTHS: 1,
  MAX_MONTHS: 12,
  DAYS_PER_MONTH: 30,
} as const;

export const BRE_RULES = {
  MIN_AGE: 23,
  MAX_AGE: 50,
  MIN_MONTHLY_SALARY: 25_000,
} as const;

/**
 * PAN: 5 letters, 4 digits, 1 letter. The 4th character encodes the holder type
 * (P=Individual, C=Company, H=HUF, F=Firm, A=AOP, T=Trust, B=BOI, L=Local authority,
 * J=Artificial juridical person, G=Government), so we validate it instead of accepting any letter.
 */
export const PAN_REGEX = /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$/;

/** Bank UTR / transaction reference: alphanumeric, 6–30 chars (covers IMPS, NEFT, RTGS, UPI refs). */
export const UTR_REGEX = /^[A-Z0-9]{6,30}$/;

/** Every action recorded in the append-only audit log. */
export const AUDIT_ACTIONS = [
  'USER_REGISTERED',
  'ACCOUNT_UPDATED',
  'PASSWORD_CHANGED',
  'PROFILE_SUBMITTED',
  'SLIP_UPLOADED',
  'PAN_CARD_UPLOADED',
  'LOAN_APPLIED',
  'LOAN_ASSIGNED',
  'DOCUMENT_VIEWED',
  'LOAN_SANCTIONED',
  'LOAN_REJECTED',
  'LOAN_DISBURSED',
  'PAYMENT_RECORDED',
  'LOAN_CLOSED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** In-app notification types. */
export const NOTIFICATION_TYPES = [
  'LOAN_APPLIED',
  'DUE_REMINDER',
  'OVERDUE',
  'OVERDUE_ALERT',
  'LOAN_SANCTIONED',
  'LOAN_REJECTED',
  'LOAN_DISBURSED',
  'PAYMENT_RECEIVED',
  'LOAN_CLOSED',
  'LOAN_ASSIGNED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Days past due on which overdue reminders go out (then every 7 days after the last one). */
export const OVERDUE_REMINDER_DAYS = [1, 3, 7] as const;

/** Which executive role owns a loan while it sits in each status (null = no work pending). */
export const STAGE_OWNER: Record<LoanStatus, ExecutiveRole | null> = {
  APPLIED: 'SANCTION',
  SANCTIONED: 'DISBURSEMENT',
  DISBURSED: 'COLLECTION',
  REJECTED: null,
  CLOSED: null,
};

/** Version of the loan terms / Key Fact Statement the borrower consents to. Stored on each loan. */
export const LOAN_TERMS_VERSION = 'KFS-2026-10';

/** Roles that need the full PAN to verify identity. Everyone else sees a masked PAN. */
export const FULL_PAN_ROLES: readonly Role[] = ['ADMIN', 'SANCTION', 'BORROWER'];

export const maskPan = (pan: string): string => (pan.length === 10 ? `${pan.slice(0, 5)}****${pan.slice(9)}` : '**********');

/** httpOnly cookie holding the JWT. Read by the API and by the Next.js route guard. */
export const AUTH_COOKIE = 'lms_token';

/** Documents a borrower must provide (collected once, at sign-up). */
export const DOCUMENT_KINDS = ['SALARY_SLIP', 'PAN_CARD'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  SALARY_SLIP: 'Salary slip',
  PAN_CARD: 'PAN card',
};

/** URL slug used by the upload endpoints: /borrower/documents/salary-slip | pan-card */
export const DOCUMENT_SLUG: Record<DocumentKind, string> = {
  SALARY_SLIP: 'salary-slip',
  PAN_CARD: 'pan-card',
};

export const UPLOAD_RULES = {
  MAX_BYTES: 5 * 1024 * 1024,
  MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png'] as const,
} as const;
