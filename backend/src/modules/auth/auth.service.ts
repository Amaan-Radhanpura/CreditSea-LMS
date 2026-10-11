import bcrypt from 'bcryptjs';
import type { ChangePasswordInput, LoginInput, UpdateAccountInput } from '@lms/shared';
import { User, type IUser } from '../../models';
import { ApiError } from '../../utils/ApiError';

const BCRYPT_ROUNDS = 10;
// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy-password', BCRYPT_ROUNDS);

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);

export async function login(input: LoginInput): Promise<IUser> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash').lean();
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.isActive) throw ApiError.unauthorized('Email or password is incorrect');
  return user;
}

export async function updateAccount(userId: string, input: UpdateAccountInput): Promise<IUser> {
  const user = await User.findByIdAndUpdate(userId, { $set: { name: input.name } }, { new: true, runValidators: true }).lean();
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/**
 * Verifies the current password, stores the new hash and stamps passwordChangedAt, which
 * invalidates every token issued before now (other devices are logged out).
 * Stamped 1s in the past because JWT `iat` has whole-second precision: the fresh token issued
 * right after this call must still be accepted.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<IUser> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Please check the highlighted fields', { currentPassword: ['Current password is incorrect'] }, 'VALIDATION_ERROR');
  }
  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordChangedAt = new Date(Date.now() - 1000);
  await user.save();
  return user.toObject();
}
