'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Step used by the − / + buttons (bigger than the slider step, so a few taps is enough). */
  buttonStep: number;
  format: (v: number) => string;
  presets: { label: string; value: number }[];
  onChange: (v: number) => void;
}

/** Slider + big −/+ buttons + quick-pick chips: works for people who find dragging hard. */
export function AmountSlider({ label, icon, value, min, max, step, buttonStep, format, presets, onChange }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <div className="flex items-center gap-2 font-semibold text-slate-600">
        <span className="text-brand-600 [&>svg]:size-5">{icon}</span> {label}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(clamp(value - buttonStep))}
          disabled={value <= min}
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-6" />
        </button>
        <p className="flex-1 text-center text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-4xl" aria-live="polite">
          {format(value)}
        </p>
        <button
          type="button"
          onClick={() => onChange(clamp(value + buttonStep))}
          disabled={value >= max}
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-6" />
        </button>
      </div>

      <input
        type="range"
        className="slider mt-5"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="mt-1 flex justify-between text-sm text-slate-400">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold ring-1 transition',
              value === p.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
