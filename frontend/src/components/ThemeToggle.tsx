'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'lms-theme';

/**
 * Runs in <head> before the page paints, so there is no light→dark flash:
 * saved choice first, otherwise the device setting.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;

// The <html> class is the single source of truth; components subscribe to it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
const getTheme = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'light');
}

function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode etc.: the choice just won't be remembered.
  }
}

/** Sun / moon button. `onDark` is for placing it on the brand-coloured panels. */
export function ThemeToggle({ onDark, className }: { onDark?: boolean; className?: string }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'grid size-10 place-items-center rounded-xl transition',
        onDark ? 'text-brand-100 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100 hover:text-brand-700',
        className,
      )}
    >
      {theme === 'dark' ? <Sun className="size-5 animate-pop" /> : <Moon className="size-5 animate-pop" />}
    </button>
  );
}

/** Toast popups follow the chosen theme too. */
export function ThemedToaster() {
  return <Toaster theme={useTheme()} position="top-center" richColors closeButton toastOptions={{ className: 'text-base' }} />;
}
