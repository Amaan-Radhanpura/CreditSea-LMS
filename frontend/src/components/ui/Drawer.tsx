'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}

/** Side panel sliding in from the right (full width on phones). Escape / backdrop click closes it. */
export function Drawer({ open, onClose, title, header, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-slate-50 shadow-2xl animate-slide-in">
        <div className="flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}>
          <div className="min-w-0 flex-1">{header ?? <h2 className="text-lg font-bold text-slate-900">{title}</h2>}</div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </div>
      </aside>
    </div>
  );
}
