import { listCollections, countPhotosByCollection } from '@/lib/gallery/queries';
import { CollectionsView } from '@/components/gallery/CollectionsView';

// A server component: middleware has already gated this path, so reading
// through the service-role client here is safe and saves a round trip.
//
// Forced dynamic: this route has no dynamic segment, so without this Next
// tries to statically prerender it at build time — running the Supabase
// query against build-time env instead of the request. The page sits
// behind middleware's per-request session check regardless, so it can
// never legitimately be static.
export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  const [collections, photoCounts] = await Promise.all([
    listCollections(),
    countPhotosByCollection(),
  ]);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
      <CollectionsView initialCollections={collections} photoCounts={photoCounts} />
    </main>
  );
}
