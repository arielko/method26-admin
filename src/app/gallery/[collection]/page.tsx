import { notFound } from 'next/navigation';
import {
  getCollection,
  listFolders,
  listPhotos,
  listGalleries,
  listHiddenFolders,
  getFavoritePhotoIds,
} from '@/lib/gallery/queries';
import { CollectionDetail } from '@/components/gallery/CollectionDetail';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const { collection: collectionId } = await params;

  const [collection, folders, photos, galleries] = await Promise.all([
    getCollection(collectionId),
    listFolders(collectionId),
    listPhotos(collectionId),
    listGalleries(collectionId),
  ]);

  if (!collection) notFound();

  const galleryIds = galleries.map((g) => g.id);
  const [hidden, favorites] = await Promise.all([
    listHiddenFolders(galleryIds),
    getFavoritePhotoIds(galleryIds),
  ]);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
      <CollectionDetail
        collection={collection}
        folders={folders}
        photos={photos}
        galleries={galleries}
        hidden={hidden}
        favorites={favorites}
      />
    </main>
  );
}
