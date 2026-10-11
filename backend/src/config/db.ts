import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

export async function connectDB(uri: string = env.MONGODB_URI): Promise<void> {
  // Fail fast (5s instead of the 30s default) so a missing DB gives a quick, clear error.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
