import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { ROLES, type Role } from '@lms/shared';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  /** Tokens issued before this moment are rejected, so a password change logs out every other session. */
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    // Never returned unless explicitly requested with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'BORROWER', required: true },
    isActive: { type: Boolean, default: true },
    passwordChangedAt: Date,
  },
  { timestamps: true },
);

// Sales "leads" list: borrowers sorted newest first.
userSchema.index({ role: 1, createdAt: -1 });

export type UserDoc = HydratedDocument<IUser>;
export const User = model<IUser>('User', userSchema);
