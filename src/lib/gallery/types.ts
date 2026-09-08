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
  created_at: string;
};

// created_at is DB-assigned on insert (see photos.created_at in
// src/types/database.ts), same as id — never supplied by a caller.
export type NewPhoto = Omit<Photo, 'id' | 'created_at'>;

export type Gallery = {
  id: string;
  collection_id: string;
  token: string;
  name: string;
  is_published: boolean;
  expiration_date: string | null;
  cover_photo_id: string | null;
  downloads_enabled: boolean;
  email_capture_enabled: boolean;
};

// One row per person per gallery. Only ever created by the public gallery's
// email-capture form — the admin never writes this table, only reads it.
export type GalleryVisitor = {
  id: string;
  gallery_id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
};
