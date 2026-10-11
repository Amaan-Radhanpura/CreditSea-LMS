'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

/** Area-level denials set by middleware.ts; anything else is a dashboard module name. */
const AREA_MESSAGES: Record<string, string> = {
  dashboard: "You're not authorized to access the staff dashboard",
  borrower: 'That page is only available to borrowers',
};

/** Shows a toast when the route guard bounced the user off a page their role can't access. */
export function DeniedNotice() {
  const denied = useSearchParams().get('denied');
  useEffect(() => {
    if (denied) toast.error(AREA_MESSAGES[denied] ?? `You don't have access to the ${denied} module`);
  }, [denied]);
  return null;
}
