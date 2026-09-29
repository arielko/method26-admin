/**
 * Authentication for the routes a machine calls, not a person.
 *
 * The admin's other routes use `authenticateSession`, which has no meaning
 * here — the daily maintenance Worker has no session and never will. These
 * routes are reachable by anyone on the internet (middleware exempts /api
 * entirely), and between them they can mail clients and read the whole
 * database, so they are the routes where getting this wrong is worst.
 *
 * One implementation rather than one per route: a second copy of a
 * constant-time compare is a second chance to write `===` by accident.
 */

export type MachineAuth = { ok: true } | { ok: false; status: 401 | 503; error: string };

export function authenticateMachine(request: Request): MachineAuth {
  const expected = process.env.MAINTENANCE_SECRET;

  // Refuse rather than fall open. An unset secret is a deploy that has not
  // finished, and a route that treats "no secret configured" as "no secret
  // required" is an open mailer with a plausible-looking guard in front of it.
  if (!expected) {
    console.error('machine-auth: MAINTENANCE_SECRET is unset');
    return { ok: false, status: 503, error: 'Maintenance routes are not configured' };
  }

  const presented = request.headers.get('x-maintenance-secret') ?? '';
  if (!timingSafeEqual(presented, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

/**
 * Compares without leaking, through timing, how much of the secret is right.
 *
 * The length difference is folded into the same accumulator rather than
 * short-circuiting, and the loop runs over the longer of the two, so a
 * wrong-length guess costs the same as a wrong-value one.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
