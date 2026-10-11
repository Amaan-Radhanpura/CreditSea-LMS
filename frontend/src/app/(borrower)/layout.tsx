import { BorrowerShell } from '@/components/borrower/BorrowerShell';

export default function BorrowerLayout({ children }: { children: React.ReactNode }) {
  return <BorrowerShell>{children}</BorrowerShell>;
}
