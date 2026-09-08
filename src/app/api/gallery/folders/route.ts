import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { createFolder, updateFolder, deleteFolder, findOrCreateDefaultFolder } from '@/lib/gallery/queries';

export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { collectionId?: unknown; name?: unknown; isRetouched?: unknown; ensureDefault?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const collectionId = typeof body.collectionId === 'string' ? body.collectionId : '';
  if (!collectionId) {
    return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
  }

  // `ensureDefault` asks for "the folder uploads go in", not "a new folder".
  // The uploader uses it so a repeated attempt cannot leave a trail of empty
  // folders behind it — see findOrCreateDefaultFolder.
  if (body.ensureDefault === true) {
    return NextResponse.json({
      folder: await findOrCreateDefaultFolder(collectionId, body.isRetouched === true),
    });
  }

  // Everything else is the photographer explicitly making a folder, which is
  // theirs to name and theirs to have as many of as they like.
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  return NextResponse.json({
    folder: await createFolder(collectionId, name, body.isRetouched === true),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { id?: unknown; name?: unknown; isRetouched?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: { name?: string; is_retouched?: boolean } = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  // Flipping this moves a folder between the client's proofing page and
  // their delivery page. It is the whole two-surface split, so it is only
  // ever set from an explicit boolean, never from a truthy value.
  if (typeof body.isRetouched === 'boolean') patch.is_retouched = body.isRetouched;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await updateFolder(id, patch);
  return NextResponse.json({ ok: true });
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

  // Its photos are unfiled (folder_id: null), not deleted — see
  // deleteFolder in queries.ts.
  await deleteFolder(id);
  return NextResponse.json({ ok: true });
}
