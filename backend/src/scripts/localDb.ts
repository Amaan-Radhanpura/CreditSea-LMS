/**
 * Zero-install local MongoDB for development: `npm run db`
 * Starts a single-node replica set (needed for transactions) on port 27017, with data persisted
 * in backend/.mongo-data. Use this if you don't have MongoDB Atlas or a local mongod installed.
 */
import fs from 'fs';
import path from 'path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = 27017;
const dbPath = path.resolve(__dirname, '../../.mongo-data');

async function main() {
  fs.mkdirSync(dbPath, { recursive: true });
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: PORT, dbPath }],
  });

  console.log('\n✅ Local MongoDB replica set is running');
  console.log(`   MONGODB_URI=mongodb://127.0.0.1:${PORT}/lms?replicaSet=rs0`);
  console.log(`   Data folder: ${dbPath}`);
  console.log('   Keep this window open. Press Ctrl+C to stop.\n');

  const stop = async () => {
    await replSet.stop({ doCleanup: false }); // keep the data on disk
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('❌ Could not start local MongoDB:', err);
  process.exit(1);
});
