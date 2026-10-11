import type { Role } from '@lms/shared';
import { ROLE_TONE, initials } from '@/lib/roles';
import { cn } from '@/lib/utils';

export function UserAvatar({ user, size = 'md' }: { user: { name: string; role: Role }; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-2xl font-bold', ROLE_TONE[user.role], size === 'lg' ? 'size-16 text-xl' : 'size-12')}>
      {initials(user.name)}
    </span>
  );
}
