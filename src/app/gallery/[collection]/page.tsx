import { listFolders, listPhotos, listGalleries, listHiddenFolders } from '@/lib/gallery/queries';
import { FolderPanel } from '@/components/gallery/FolderPanel';
import { GalleryPanel } from '@/components/gallery/GalleryPanel';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const { collection } = await params;
  const [folders, photos, galleries] = await Promise.all([
    listFolders(collection),
    listPhotos(collection),
    listGalleries(collection),
  ]);
  const hidden = await listHiddenFolders(galleries.map((g) => g.id));

  return (
    <main>
      <h1>Shoot</h1>
      <FolderPanel collectionId={collection} folders={folders} photos={photos} />
      <GalleryPanel collectionId={collection} galleries={galleries} folders={folders} hidden={hidden} />
    </main>
  );
}
