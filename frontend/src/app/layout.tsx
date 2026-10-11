import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/components/AuthProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'CreditSea: Easy Personal Loans', template: '%s · CreditSea' },
  description: 'Apply for a personal loan in 3 simple steps.',
};

export const viewport: Viewport = { themeColor: '#4f46e5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'text-base' }} />
      </body>
    </html>
  );
}
