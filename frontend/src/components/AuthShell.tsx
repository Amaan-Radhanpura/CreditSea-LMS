import { CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/ui/Logo';

const POINTS = ['Loans from ₹50,000 to ₹5,00,000', 'Simple 12% yearly interest', 'Know your total before you apply'];

/** Split layout: brand panel on desktop, compact header on mobile. */
export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`grid min-h-dvh ${wide ? 'lg:grid-cols-[0.8fr_1.4fr]' : 'lg:grid-cols-[1fr_1.1fr]'}`}>
      <aside className="relative hidden overflow-hidden bg-brand-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-brand-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-[22rem] rounded-full bg-emerald-500/20 blur-3xl" />
        <Logo light className="relative" />
        <div className="relative">
          <h2 className="text-4xl leading-tight font-extrabold">Money when you need it.<br />No confusion.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-lg text-brand-100">
                <CheckCircle2 className="size-6 text-emerald-300" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200/70">© CreditSea Loan Management System</p>
      </aside>

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className={`mx-auto flex w-full flex-1 flex-col justify-center py-10 animate-fade-in ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
          <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
          <p className="mt-2 text-lg text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
