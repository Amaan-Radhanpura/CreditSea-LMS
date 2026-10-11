import { Schema, model, type Types } from 'mongoose';
import { DOCUMENT_KINDS, UPLOAD_RULES, type DocumentKind } from '@lms/shared';

/** Metadata for an uploaded file. The binary lives on disk under a random name. */
export interface IDocument {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  kind: DocumentKind;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    originalName: { type: String, required: true, maxlength: 255 },
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, enum: UPLOAD_RULES.MIME_TYPES, required: true },
    size: { type: Number, required: true, max: UPLOAD_RULES.MAX_BYTES },
  },
  { timestamps: true },
);

export const DocumentModel = model<IDocument>('Document', documentSchema);
