import { DASHBOARD_MODULES, type DashboardModule, type Role } from '@lms/shared';

export const MODULE_ORDER: DashboardModule[] = ['sales', 'sanction', 'disbursement', 'collection'];

export const canAccessModule = (role: Role, module: DashboardModule): boolean =>
  role === 'ADMIN' || DASHBOARD_MODULES[module] === role;

export const allowedModules = (role: Role): DashboardModule[] => MODULE_ORDER.filter((m) => canAccessModule(role, m));

/** Where each role lands after login. */
export function homeFor(role: Role): string {
  if (role === 'BORROWER') return '/home';
  if (role === 'ADMIN') return '/dashboard';
  return `/dashboard/${allowedModules(role)[0]}`;
}
