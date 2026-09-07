import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client with session management.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — safe to ignore with middleware.
          }
        },
      },
    }
  );
}

/**
 * Admin Supabase client — bypasses RLS.
 * Use only in server-side operations. NEVER expose to client.
 */
export function createAdminClient() {
  // Fail loudly on missing configuration. The `!` assertions this replaces
  // passed `undefined` straight through to supabase-js, which sent an empty
  // apikey header and surfaced as "Invalid API key" — a message that reads
  // like a WRONG key and sends you looking in entirely the wrong place. A
  // missing binding and a bad credential deserve different messages.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const missing = [!url && 'SUPABASE_URL', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(Boolean)
      .join(', ');
    throw new Error(`Supabase is not configured in this runtime: ${missing} unset`);
  }

  return createServerClient<Database>(
    url,
    serviceKey,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );
}
