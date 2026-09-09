import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { createDrop, listDrops, deleteDrop, updateDrop, dropExists } from '@/lib/drops/queries';

// A transfer is created empty and filled by the upload, so the browser has a
// drop id to derive keys from before the first byte moves.
export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { title?: unknown; message?: unknown; expiresInDays?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const field of ['title', 'message'] as const) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
    }
  }

  // Days, not a date: the client picks "3 days" and the server decides what
  // that means, so a clock-skewed or hand-edited browser cannot mint a
  // transfer that outlives what was chosen.
  let expiresAt: string | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return NextResponse.json({ error: 'expiresInDays must be between 1 and 365' }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const drop = await createDrop({
    title: typeof body.title === 'string' ? body.title : null,
    message: typeof body.message === 'string' ? body.message : null,
    expiresAt,
  });
  return NextResponse.json({ drop });
}

// Title, message and expiry are set here rather than at creation, because the
// studio types them while the files are already uploading — the transfer has
// to exist before the first byte moves, and nobody has written a title yet.
export async function PATCH(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { id?: unknown; title?: unknown; message?: unknown; expiresInDays?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (!(await dropExists(id))) return NextResponse.json({ error: 'unknown transfer' }, { status: 404 });

  const patch: { title?: string | null; message?: string | null; expires_at?: string | null } = {};
  if (typeof body.title === 'string') patch.title = body.title.trim() || null;
  if (typeof body.message === 'string') patch.message = body.message.trim() || null;

  if (body.expiresInDays !== undefined) {
    if (body.expiresInDays === null) {
      patch.expires_at = null;
    } else {
      const days = Number(body.expiresInDays);
      if (!Number.isFinite(days) || days <= 0 || days > 365) {
        return NextResponse.json({ error: 'expiresInDays must be between 1 and 365' }, { status: 400 });
      }
      patch.expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await updateDrop(id, patch);
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);
  return NextResponse.json({ drops: await listDrops() });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  await deleteDrop(id);
  return NextResponse.json({ ok: true });
}
