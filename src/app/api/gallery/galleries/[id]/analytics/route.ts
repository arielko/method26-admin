import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { isAnalyticsTab } from '@/lib/gallery/analytics-tab';
import {
  getGallery,
  getGalleryOverviewStats,
  listFavoritesByVisitor,
  getConsensusRanking,
  listVisitorsWithActivity,
  listDownloadLog,
} from '@/lib/gallery/queries';

// This is the one route in the admin that hands names and email addresses
// back to the browser (Favourites, Visitors). middleware.ts exempts /api
// entirely, so the auth check below is the only thing standing between
// this data and the public internet — see surface.test.ts.
//
// Every tab is pre-aggregated or display-scoped server-side in queries.ts;
// none of them ship a raw table dump for the client to reduce itself.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;
  const tab = request.nextUrl.searchParams.get('tab');
  if (!isAnalyticsTab(tab)) {
    return NextResponse.json(
      { error: 'tab must be one of overview, favorites, consensus, visitors, downloads' },
      { status: 400 }
    );
  }

  // The id in the URL is resolved server-side into a real gallery before
  // any per-gallery table is queried, so an id naming nothing 404s instead
  // of quietly returning empty aggregates that look identical to "no
  // activity yet".
  const gallery = await getGallery(id);
  if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });

  switch (tab) {
    case 'overview':
      return NextResponse.json({ stats: await getGalleryOverviewStats(id) });
    case 'favorites':
      return NextResponse.json({
        groups: await listFavoritesByVisitor(id),
        emailCaptureEnabled: gallery.email_capture_enabled,
      });
    case 'consensus':
      return NextResponse.json({
        frames: await getConsensusRanking(id),
        emailCaptureEnabled: gallery.email_capture_enabled,
      });
    case 'visitors':
      return NextResponse.json({
        visitors: await listVisitorsWithActivity(id),
        emailCaptureEnabled: gallery.email_capture_enabled,
      });
    case 'downloads':
      return NextResponse.json({
        downloads: await listDownloadLog(id),
        downloadsEnabled: gallery.downloads_enabled,
      });
  }
}
