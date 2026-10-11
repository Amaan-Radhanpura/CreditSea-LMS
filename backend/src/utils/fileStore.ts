import { Readable } from 'stream';
import mongoose, { Types } from 'mongoose';

/**
 * Uploaded documents live in MongoDB GridFS (bucket "uploads"), not on the server's disk:
 * they survive restarts and redeploys on hosts with an ephemeral filesystem, and they are
 * backed up together with the rest of the data.
 */
const bucket = () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database is not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
};

export function saveFile(buffer: Buffer, filename: string, contentType: string): Promise<Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { metadata: { contentType } });
    Readable.from(buffer)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () => resolve(upload.id as Types.ObjectId));
  });
}

export const openFile = (fileId: Types.ObjectId) => bucket().openDownloadStream(fileId);

/** Best-effort cleanup (e.g. when the database write that would reference the file fails). */
export async function deleteFile(fileId: Types.ObjectId): Promise<void> {
  try {
    await bucket().delete(fileId);
  } catch {
    // already gone
  }
}
