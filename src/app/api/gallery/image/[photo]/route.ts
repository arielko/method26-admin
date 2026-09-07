import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { signedGetUrl } from '@/lib/gallery/b2';
import { getPhotoForImage } from '@/lib/gallery/queries';
import { isImageVariant, variantKeyField } from '@/lib/gallery/image-variant';

// This route is the admin's only way to actually see a photograph: the
// bucket is private, and the app can otherwise only mint upload URLs.
// middleware.ts exempts /api entirely, so nothing upstream protects it —
// the auth check below is the only thing standing between this route and
// the public internet.
//
// It must have no path that can serve original_key. The variant a caller
// asks for is validated against image-variant.ts's two-entry allowlist and
// only that entry's key is looked up — there's no string interpolation or
// index access on the caller's input that could reach a third field, and
// the underlying query (getPhotoForImage) never even selects original_key
// from the database, so there's no column here to leak by mistake. There
// is no admin use for full-resolution bytes in a grid, and the public
// site's entire design rests on originals being reachable only through
// its own delivery route.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photo: string }> }
) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const variant = request.nextUrl.searchParams.get('v');
  if (!isImageVariant(variant)) {
    return NextResponse.json({ error: 'v must be "thumb" or "preview"' }, { status: 400 });
  }

  const { photo: photoId } = await params;
  const photo = await getPhotoForImage(photoId);
  if (!photo) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const key = photo[variantKeyField(variant)];

  try {
    const url = await signedGetUrl(key);
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    // Never echo the underlying message: it can name configuration.
    console.error('signedGetUrl failed', error);
    return NextResponse.json({ error: 'Could not sign image URL' }, { status: 500 });
  }
}
