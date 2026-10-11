import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepDef {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Icon-led progress: works for people who don't read the labels. */
export function Stepper({ steps, current, maxReached, onSelect }: { steps: StepDef[]; current: number; maxReached: number; onSelect: (i: number) => void }) {
  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-slate-500 sm:text-left">
        Step {current + 1} of {steps.length}
      </p>
      <ol className="flex items-center">
        {steps.map((s, i) => {
          const done = i < maxReached && i !== current;
          const active = i === current;
          const reachable = i <= maxReached;
          return (
            <li key={s.label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(i)}
                aria-current={active ? 'step' : undefined}
                className="group flex flex-col items-center gap-2 disabled:cursor-not-allowed sm:flex-row"
              >
                <span
                  className={cn(
                    'grid size-12 place-items-center rounded-2xl transition-all',
                    active && 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 scale-110',
                    done && 'bg-emerald-500 text-white',
                    !active && !done && 'bg-white text-slate-400 ring-1 ring-slate-200',
                  )}
                >
                  {done ? <Check className="size-6" strokeWidth={3} /> : <s.icon className="size-6" />}
                </span>
                <span className={cn('text-xs font-semibold sm:text-base', active ? 'text-brand-700' : done ? 'text-emerald-700' : 'text-slate-400')}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className={cn('mx-2 mb-6 h-1 flex-1 rounded-full sm:mb-0 sm:mx-4', i < maxReached ? 'bg-emerald-400' : 'bg-slate-200')} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
