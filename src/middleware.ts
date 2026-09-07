/**
 * Edge Middleware — auth gate for the dashboard.
 *
 * NOTE: Next 16 deprecated the `middleware.ts` filename in favor of
 * `proxy.ts`, but the new `proxy` runtime is nodejs-only and OpenNext on
 * Cloudflare Workers requires Edge runtime. We deliberately keep the
 * legacy `middleware.ts` filename + `middleware` export until OpenNext +
 * Next add support for Edge proxies.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Allow login page and static assets
  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Check for valid session
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({ request });
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Being signed in is not the same as being allowed in. Supabase projects
  // permit self-signup by default and this app's own login page ships the
  // anon key, so a session proves only that somebody confirmed an email
  // address. Access requires an explicit grant, matching the same rule in
  // lib/api/auth.ts — which is what protects /api, since the matcher above
  // exempts it.
  //
  // A signed-in account without the grant is sent back to /login rather than
  // shown an error page: there is nothing here for them, and the app has no
  // sign-up route by design.
  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'social') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('denied', '1');
    return NextResponse.redirect(loginUrl);
  }

  // The upstream project routed a 'social' role to /social here. That module
  // is deleted in this fork, so the redirect is gone — it would have pointed
  // at a route that no longer exists.

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
