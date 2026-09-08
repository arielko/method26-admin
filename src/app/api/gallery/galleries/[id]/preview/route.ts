import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { getGallery } from '@/lib/gallery/queries';
import { buildGalleryShareEmailHtml, type GalleryEmailVariant } from '@/lib/gallery/email-templates';
import { galleryUrl } from '@/lib/gallery/site-url';

// Renders the email exactly as it will be sent, so the share screen's preview
// is the real template rather than a second hand-built approximation of it.
// The approximation is the failure mode worth avoiding: it drifts silently,
// and the studio only finds out from a client.
//
// Same builder, same inputs, same gallery row as POST ../send. The only thing
// that differs is that nothing is delivered.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;

  let body: { message?: unknown; variant?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.message !== undefined && typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message must be a string' }, { status: 400 });
  }
  if (body.variant !== undefined && body.variant !== 'proofing' && body.variant !== 'finals') {
    return NextResponse.json({ error: 'variant must be proofing or finals' }, { status: 400 });
  }

  const gallery = await getGallery(id);
  if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });

  const html = buildGalleryShareEmailHtml({
    galleryName: gallery.name,
    url: galleryUrl(gallery.token),
    message: typeof body.message === 'string' ? body.message : undefined,
    expiresAt: gallery.expiration_date,
    variant: (body.variant as GalleryEmailVariant | undefined) ?? 'proofing',
  });

  // Returned as JSON, not as a text/html body: the client renders it into a
  // sandboxed iframe, and handing the browser a navigable HTML document from
  // this origin invites it to be opened as a page instead.
  return NextResponse.json({ html });
}
