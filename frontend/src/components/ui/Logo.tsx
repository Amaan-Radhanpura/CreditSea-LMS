import Link from 'next/link';
import { Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2.5 font-extrabold tracking-tight', className)}>
      <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
        <Waves className="size-6" aria-hidden />
      </span>
      <span className={cn('text-xl', light ? 'text-white' : 'text-slate-900')}>
        Credit<span className={light ? 'text-brand-200' : 'text-brand-600'}>Sea</span>
      </span>
    </Link>
  );
}
