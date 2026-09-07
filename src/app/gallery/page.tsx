import Link from 'next/link';
import { listCollections } from '@/lib/gallery/queries';
import { CollectionList } from '@/components/gallery/CollectionList';

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
  const collections = await listCollections();
  return (
    <main>
      <h1>Galleries</h1>
      <CollectionList initial={collections} />
      {collections.length === 0 && <p>No shoots yet. Create one to start uploading.</p>}
      <ul>
        {collections.map((collection) => (
          <li key={collection.id}>
            <Link href={`/gallery/${collection.id}`}>{collection.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
