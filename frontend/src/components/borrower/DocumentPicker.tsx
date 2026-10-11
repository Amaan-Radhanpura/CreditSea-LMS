'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileText, ImageIcon, RefreshCw, UploadCloud } from 'lucide-react';
import { UPLOAD_RULES } from '@lms/shared';
import { cn, formatBytes } from '@/lib/utils';

/** Returns a plain-language problem with the file, or null if it is acceptable. */
export function checkFile(file: File): string | null {
  if (!(UPLOAD_RULES.MIME_TYPES as readonly string[]).includes(file.type)) return 'Please choose a PDF, JPG or PNG file.';
  if (file.size > UPLOAD_RULES.MAX_BYTES) return `This file is ${formatBytes(file.size)}. The limit is 5 MB.`;
  return null;
}

interface Props {
  label: string;
  hint: string;
  icon: React.ReactNode;
  file: File | null;
  error?: string;
  onPick: (file: File | null, error: string) => void;
}

/** Big tap/drop target that only selects a file locally (it is uploaded with the sign-up form). */
export function DocumentPicker({ label, hint, icon, file, error, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = checkFile(f);
    onPick(problem ? null : f, problem ?? '');
  };

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-700">
        <span className="text-brand-600 [&>svg]:size-5">{icon}</span> {label}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          'flex w-full items-center gap-4 rounded-2xl border-2 border-dashed p-4 text-left transition',
          file ? 'border-emerald-300 bg-emerald-50' : error ? 'border-rose-300 bg-rose-50' : dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400',
        )}
      >
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', file ? 'bg-emerald-500 text-white' : 'bg-brand-100 text-brand-600')}>
          {file ? <CheckCircle2 className="size-7" /> : <UploadCloud className="size-7" />}
        </span>
        <span className="min-w-0 flex-1">
          {file ? (
            <>
              <span className="flex items-center gap-1.5 truncate font-semibold text-emerald-800">
                {file.type === 'application/pdf' ? <FileText className="size-4 shrink-0" /> : <ImageIcon className="size-4 shrink-0" />}
                <span className="truncate">{file.name}</span>
              </span>
              <span className="flex items-center gap-1 text-sm text-emerald-700">
                {formatBytes(file.size)} · <RefreshCw className="size-3.5" /> tap to change
              </span>
            </>
          ) : (
            <>
              <span className="block font-semibold text-slate-800">Tap to choose a file</span>
              <span className="text-sm text-slate-500">{hint}</span>
            </>
          )}
        </span>
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-rose-600">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={[...UPLOAD_RULES.MIME_TYPES, ...UPLOAD_RULES.EXTENSIONS].join(',')}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
