import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { addDropFiles, dropExists } from '@/lib/drops/queries';
import { parseDropKey } from '@/lib/drops/keys';

// Records files whose objects are already in the bucket. Called once per file,
// immediately after that file's PUT succeeds — the same shape the gallery
// uploader uses, and for the same reason: an object with no row merely wastes
// storage, while a row with no object is a broken download.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;
  if (!(await dropExists(id))) {
    return NextResponse.json({ error: 'unknown transfer' }, { status: 404 });
  }

  let body: { files?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: 'files must be a non-empty array' }, { status: 400 });
  }

  type Incoming = {
    id?: unknown;
    filename?: unknown;
    object_key?: unknown;
    content_type?: unknown;
    file_size_bytes?: unknown;
  };

  const rows = [];
  for (const raw of body.files as Incoming[]) {
    if (
      typeof raw.id !== 'string' ||
      typeof raw.filename !== 'string' ||
      typeof raw.object_key !== 'string' ||
      typeof raw.content_type !== 'string'
    ) {
      return NextResponse.json({ error: 'each file needs id, filename, object_key, content_type' }, { status: 400 });
    }
    // The key must be one this transfer could have minted. Without this a
    // session could attach an object belonging to a different transfer — or
    // any path at all — to a link it controls.
    const parsed = parseDropKey(raw.object_key);
    if (!parsed || parsed.dropId !== id) {
      return NextResponse.json({ error: 'object_key does not belong to this transfer' }, { status: 400 });
    }
    rows.push({
      id: raw.id,
      filename: raw.filename.slice(0, 300),
      object_key: raw.object_key,
      content_type: raw.content_type.slice(0, 120),
      file_size_bytes: typeof raw.file_size_bytes === 'number' ? raw.file_size_bytes : null,
    });
  }

  await addDropFiles(id, rows);
  return NextResponse.json({ ok: true });
}
