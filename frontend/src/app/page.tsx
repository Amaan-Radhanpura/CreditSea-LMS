import Link from 'next/link';
import { ArrowRight, BadgePercent, Clock, FileUp, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

const STEPS = [
  { icon: UserRound, title: 'Create your account', text: 'Your details, once. We check eligibility instantly' },
  { icon: FileUp, title: 'Add 2 documents', text: 'Salary slip and PAN card, photo or PDF' },
  { icon: SlidersHorizontal, title: 'Choose your loan', text: 'Pick amount and days. That is all, every time' },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-brand-950 text-white">
      <div className="pointer-events-none absolute -top-40 -right-40 size-[36rem] rounded-full bg-brand-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 size-[30rem] rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Logo light />
          <Link href="/login" className="rounded-xl px-4 py-2 font-semibold text-brand-100 hover:bg-white/10">
            Log in
          </Link>
        </header>

        <section className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-brand-100 ring-1 ring-white/15">
              <BadgePercent className="size-4" /> Flat 12% per year · No hidden charges
            </span>
            <h1 className="mt-6 text-4xl leading-tight font-extrabold sm:text-6xl">
              Personal loans, <span className="bg-gradient-to-r from-emerald-300 to-brand-200 bg-clip-text text-transparent">made simple.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-brand-100/90">
              Get ₹50,000 to ₹5,00,000 in 3 easy steps. See exactly what you pay back before you apply.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white px-7 text-lg font-bold text-brand-700 shadow-xl shadow-black/20 transition hover:bg-brand-50"
              >
                Apply now <ArrowRight className="size-5" />
              </Link>
              <Link href="/login" className="inline-flex h-14 items-center justify-center rounded-2xl px-7 text-lg font-semibold ring-1 ring-white/30 hover:bg-white/10">
                I have an account
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/80">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" /> Your data is safe</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> Takes 5 minutes</span>
            </div>
          </div>

          <ol className="grid gap-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="flex items-center gap-5 rounded-3xl bg-white/[0.07] p-5 ring-1 ring-white/10 backdrop-blur animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg">
                  <s.icon className="size-7" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-brand-200">Step {i + 1}</p>
                  <p className="text-lg font-bold">{s.title}</p>
                  <p className="text-brand-100/80">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
