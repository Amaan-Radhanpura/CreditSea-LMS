import { z } from 'zod';
import { EMI_RULES, EMPLOYMENT_MODES, LOAN_RULES, LOAN_STATUSES, REPAYMENT_PLANS, ROLES, UTR_REGEX } from './constants';
import { toBusinessDate } from './money';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` that is a real calendar date and not after today (IST business date). */
const pastDate = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .regex(ISO_DATE, `${label} must be a valid date`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} must be a valid date`)
    .refine((v) => v <= toBusinessDate(), `${label} cannot be in the future`);

const hasMaxTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const nameRule = z.string().trim().min(2, 'Please enter your name').max(100);

export const registerSchema = z.object({
  name: nameRule,
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: passwordRule,
});

/** Self-service account edit. Email (login identity) and role are deliberately not editable here. */
export const updateAccountSchema = z.object({ name: nameRule });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Please enter your current password'),
    newPassword: passwordRule,
  })
  .refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], message: 'New password must be different from the current one' });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: z.string().min(1, 'Please enter your password'),
});

/**
 * Shape validation only. Eligibility (age, salary, PAN format, employment) is the BRE's job,
 * so a well-formed but ineligible profile gets a 422 with every failed rule, not a 400.
 */
export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(100)
    .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'Name can only have letters and spaces'),
  pan: z.string().trim().toUpperCase().min(1, 'Please enter your PAN').max(10, 'PAN has 10 characters'),
  dob: pastDate('Date of birth'),
  monthlySalary: z.number({ invalid_type_error: 'Please enter your salary' }).nonnegative().max(100_000_000),
  employmentMode: z.enum(EMPLOYMENT_MODES, { errorMap: () => ({ message: 'Please choose your work type' }) }),
});

/**
 * Borrower sign-up: account + personal details in one go (sent as multipart with the two documents).
 * Multipart fields arrive as strings, so the salary is coerced to a number.
 */
export const signupSchema = registerSchema.merge(profileSchema).extend({
  monthlySalary: z.coerce.number({ invalid_type_error: 'Please enter your salary' }).nonnegative().max(100_000_000),
});

const principalRule = z
  .number()
  .int('Loan amount must be a whole number')
  .min(LOAN_RULES.MIN_PRINCIPAL, 'Minimum loan is ₹50,000')
  .max(LOAN_RULES.MAX_PRINCIPAL, 'Maximum loan is ₹5,00,000');

const tenureRule = z
  .number()
  .int('Tenure must be whole days')
  .min(LOAN_RULES.MIN_TENURE_DAYS, 'Minimum tenure is 30 days')
  .max(LOAN_RULES.MAX_TENURE_DAYS, 'Maximum tenure is 365 days');

/**
 * ONE_TIME: pay everything at the end of `tenureDays` (the assignment's default).
 * EMI: pay in `emiMonths` equal monthly instalments; tenure is derived (months x 30 days).
 */
export const applyLoanSchema = z
  .object({
    principal: principalRule,
    repaymentPlan: z.enum(REPAYMENT_PLANS).default('ONE_TIME'),
    tenureDays: tenureRule.optional(),
    emiMonths: z
      .number()
      .int('Choose a whole number of months')
      .min(EMI_RULES.MIN_MONTHS, 'Minimum is 1 month')
      .max(EMI_RULES.MAX_MONTHS, 'Maximum is 12 months')
      .optional(),
    /** The borrower ticked "I have read the Key Facts and agree". The server rejects anything but `true`. */
    consentAccepted: z.literal(true, { errorMap: () => ({ message: 'Please accept the loan terms to continue' }) }),
  })
  .superRefine((v, ctx) => {
    if (v.repaymentPlan === 'ONE_TIME' && v.tenureDays === undefined) {
      ctx.addIssue({ code: 'custom', path: ['tenureDays'], message: 'Please choose the number of days' });
    }
    if (v.repaymentPlan === 'EMI' && v.emiMonths === undefined) {
      ctx.addIssue({ code: 'custom', path: ['emiMonths'], message: 'Please choose the number of months' });
    }
  });

export const rejectLoanSchema = z.object({
  reason: z.string().trim().min(10, 'Please give a reason (at least 10 characters)').max(500),
});

export const paymentSchema = z.object({
  utr: z
    .string()
    .trim()
    .toUpperCase()
    .regex(UTR_REGEX, 'UTR must be 6–30 letters or numbers'),
  amount: z
    .number({ invalid_type_error: 'Please enter the amount' })
    .positive('Amount must be more than ₹0')
    .refine(hasMaxTwoDecimals, 'Amount can have at most 2 decimal places'),
  paymentDate: pastDate('Payment date'),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  status: z.enum(LOAN_STATUSES).optional(),
  /** "true" = only loans assigned to the current executive. */
  mine: z.enum(['true', 'false']).optional(),
  /** "true" = only disbursed loans past their due date. */
  overdue: z.enum(['true', 'false']).optional(),
});

export const assignLoanSchema = z.object({
  assigneeId: z.string().regex(/^[a-f0-9]{24}$/, 'Please choose an executive'),
});

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
});

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ApplyLoanInput = z.infer<typeof applyLoanSchema>;
export type RejectLoanInput = z.infer<typeof rejectLoanSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type AssignLoanInput = z.infer<typeof assignLoanSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
