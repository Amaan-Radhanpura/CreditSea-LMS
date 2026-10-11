import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  /** Shown before the input, e.g. "₹". */
  prefix?: string;
  hint?: string;
  error?: string;
}

/** Labelled input with icon, hint and a plain-language error underneath. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, icon, prefix, hint, error, className, id, ...props }, ref) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="flex items-center gap-2 text-base font-semibold text-slate-700">
        {icon && <span className="text-brand-600 [&>svg]:size-5">{icon}</span>}
        {label}
      </label>
      <div
        className={cn(
          'flex items-center rounded-xl bg-white ring-1 transition focus-within:ring-2',
          error ? 'ring-rose-400 focus-within:ring-rose-500' : 'ring-slate-300 focus-within:ring-brand-500',
        )}
      >
        {prefix && <span className="pl-4 text-lg font-semibold text-slate-500">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn('h-13 w-full rounded-xl bg-transparent px-4 text-lg text-slate-900 outline-none placeholder:text-slate-400', className)}
          {...props}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="flex items-center gap-1.5 text-sm font-medium text-rose-600">
          <AlertCircle className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
Field.displayName = 'Field';
