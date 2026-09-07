import { listFolders, listPhotos, listGalleries } from '@/lib/gallery/queries';
import { FolderPanel } from '@/components/gallery/FolderPanel';

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

  return (
    <main>
      <h1>Shoot</h1>
      <FolderPanel collectionId={collection} folders={folders} photos={photos} />
      <p>{galleries.length} client link(s)</p>
    </main>
  );
}
