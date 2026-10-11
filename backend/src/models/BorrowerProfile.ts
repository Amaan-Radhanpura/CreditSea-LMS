import { Schema, model, type Types } from 'mongoose';
import { EMPLOYMENT_MODES, type BreFailure, type EmploymentMode } from '@lms/shared';

export interface IBorrowerProfile {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  fullName: string;
  pan: string;
  dob: Date;
  /** Paise */
  monthlySalary: number;
  employmentMode: EmploymentMode;
  bre: { passed: boolean; failures: BreFailure[]; checkedAt: Date };
  salarySlip: Types.ObjectId | null;
  panCard: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const breSchema = new Schema(
  {
    passed: { type: Boolean, required: true },
    failures: [{ _id: false, rule: String, message: String }],
    checkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const borrowerProfileSchema = new Schema<IBorrowerProfile>(
  {
    // 1:1 with a BORROWER user. Kept out of `users` so auth lookups stay small.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    pan: { type: String, required: true, uppercase: true, trim: true },
    dob: { type: Date, required: true },
    monthlySalary: { type: Number, required: true, min: 0, validate: Number.isInteger },
    employmentMode: { type: String, enum: EMPLOYMENT_MODES, required: true },
    // Failed checks are stored too, so Sales can see why a lead dropped off.
    bre: { type: breSchema, required: true },
    salarySlip: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    panCard: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
  },
  { timestamps: true },
);

// One PAN = one eligible borrower. Partial so junk PANs on failed BRE attempts can't collide.
borrowerProfileSchema.index({ pan: 1 }, { unique: true, partialFilterExpression: { 'bre.passed': true } });

export const BorrowerProfile = model<IBorrowerProfile>('BorrowerProfile', borrowerProfileSchema);
