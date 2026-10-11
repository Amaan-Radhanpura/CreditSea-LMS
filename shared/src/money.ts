/**
 * All money is stored as integer paise to avoid floating-point drift.
 * The API speaks rupees (numbers with up to 2 decimals); conversion happens at the boundary.
 */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const toRupees = (paise: number): number => paise / 100;

/**
 * The lender operates in India, so "today" for business rules (payment dates, age, due dates)
 * is the IST calendar date, wherever the server runs. Without this, a UTC server rejects
 * "today" as a future date between 00:00 and 05:30 IST.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from business date `from` to `to` (both YYYY-MM-DD). */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** IST calendar date (YYYY-MM-DD) of an instant. */
export const toBusinessDate = (d: Date = new Date()): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formats a rupee amount as ₹1,05,917.81 (Indian digit grouping). */
export const formatINR = (rupees: number): string => inrFormatter.format(rupees);
