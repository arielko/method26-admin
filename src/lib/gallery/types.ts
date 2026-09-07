export type Collection = { id: string; name: string; created_at: string };

export type Folder = {
  id: string;
  collection_id: string;
  name: string;
  is_retouched: boolean;
  sort_order: number;
};

// Keys, never URLs. A stored URL is permanently hotlinkable and leaks the
// bucket layout; the public site mints short-TTL signed URLs from these.
export type Photo = {
  id: string;
  collection_id: string;
  folder_id: string | null;
  filename: string;
  thumbnail_key: string;
  preview_key: string;
  original_key: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
};

export type NewPhoto = Omit<Photo, 'id'>;

export type Gallery = {
  id: string;
  collection_id: string;
  token: string;
  name: string;
  is_published: boolean;
  expiration_date: string | null;
};
