/**
 * Creates (and removes stale) indexes on the database in MONGODB_URI so it matches the schemas:
 * `npm run db:indexes`. Safe to run any number of times. `npm run seed` does this too.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db';
import { AuditLog, BorrowerProfile, DocumentModel, Loan, Notification, Payment, User } from '../models';

async function main() {
  await connectDB();
  for (const model of [User, BorrowerProfile, DocumentModel, Loan, Payment, AuditLog, Notification]) {
    await model.syncIndexes();
    const indexes = await model.collection.indexes();
    console.log(`${model.collection.name.padEnd(18)} ${indexes.map((i) => i.name).join(', ')}`);
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('❌ Index sync failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
