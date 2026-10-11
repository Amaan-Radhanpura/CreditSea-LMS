import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { AUTH_COOKIE, DASHBOARD_MODULES, ROLES, type DashboardModule, type Role } from '@lms/shared';
import { canAccessModule, homeFor } from '@/lib/routes';

/**
 * Frontend half of RBAC: users never even see a page their role can't use.
 * (The API enforces the same rules independently. This guard is for UX, not security.)
 */
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

async function getRole(req: NextRequest): Promise<Role | null> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return (ROLES as readonly string[]).includes(payload.role as string) ? (payload.role as Role) : null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await getRole(req);
  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  const isAuthPage = pathname === '/login' || pathname === '/register';
  if (pathname === '/' || isAuthPage) {
    return role ? redirect(homeFor(role)) : NextResponse.next();
  }

  if (!role) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  const isBorrowerArea = ['/home', '/apply', '/my-loans', '/profile'].some((p) => pathname.startsWith(p));
  if (isBorrowerArea && role !== 'BORROWER') return redirect(`${homeFor(role)}?denied=borrower`);

  if (pathname.startsWith('/dashboard')) {
    if (role === 'BORROWER') return redirect(`${homeFor(role)}?denied=dashboard`);
    const moduleName = pathname.split('/')[2];
    if (!moduleName) return role === 'ADMIN' ? NextResponse.next() : redirect(homeFor(role));
    if (moduleName === 'activity' || moduleName === 'profile') return NextResponse.next(); // every staff member's own pages
    if (moduleName === 'users') return role === 'ADMIN' ? NextResponse.next() : redirect(`${homeFor(role)}?denied=users`);
    if (!(moduleName in DASHBOARD_MODULES) || !canAccessModule(role, moduleName as DashboardModule)) {
      return redirect(`${homeFor(role)}?denied=${moduleName}`);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
