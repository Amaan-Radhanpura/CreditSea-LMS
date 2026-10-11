import { Schema, model, type Types } from 'mongoose';

export interface IPayment {
  _id: Types.ObjectId;
  loan: Types.ObjectId;
  utr: string;
  /** Paise */
  amount: number;
  paymentDate: Date;
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Own collection (not embedded in Loan): unbounded growth and a globally unique UTR.
const paymentSchema = new Schema<IPayment>(
  {
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', required: true },
    utr: { type: String, required: true, trim: true, uppercase: true, unique: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    paymentDate: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Payment ledger for a loan, latest first.
paymentSchema.index({ loan: 1, paymentDate: -1 });

export const Payment = model<IPayment>('Payment', paymentSchema);
