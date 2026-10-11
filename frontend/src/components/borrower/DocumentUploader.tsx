'use client';

import { useState } from 'react';
import { CreditCard, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { DOCUMENT_LABEL, DOCUMENT_SLUG, type BorrowerStateDTO, type DocumentKind } from '@lms/shared';
import { Button } from '@/components/ui/Button';
import { api, errorMessage } from '@/lib/api';
import { DocumentPicker } from './DocumentPicker';

const HINT: Record<DocumentKind, string> = {
  SALARY_SLIP: 'Your latest salary slip · PDF, JPG or PNG · max 5 MB',
  PAN_CARD: 'A clear photo or scan of your PAN card · max 5 MB',
};

/** Pick + upload a replacement salary slip or PAN card (profile page). */
export function DocumentUploader({ kind, onDone, onCancel }: { kind: DocumentKind; onDone: (s: BorrowerStateDTO) => void; onCancel?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file) return setError(`Please choose your ${DOCUMENT_LABEL[kind].toLowerCase()}`);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      onDone(await api.post<BorrowerStateDTO>(`/borrower/documents/${DOCUMENT_SLUG[kind]}`, body));
      toast.success(`${DOCUMENT_LABEL[kind]} updated`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <DocumentPicker
        label={`New ${DOCUMENT_LABEL[kind].toLowerCase()}`}
        hint={HINT[kind]}
        icon={kind === 'PAN_CARD' ? <CreditCard /> : <FileText />}
        file={file}
        error={error}
        onPick={(f, e) => {
          setFile(f);
          setError(e);
        }}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={uploading}>
            Cancel
          </Button>
        )}
        <Button onClick={upload} loading={uploading} disabled={!file}>
          Upload
        </Button>
      </div>
    </div>
  );
}
