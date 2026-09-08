// Generated from the live method26 Supabase project (hyfcsqrwlolkkxopmcqj) with:
//   npx supabase gen types typescript --project-id hyfcsqrwlolkkxopmcqj
//
// This replaced the upstream project's schema, which described dozens of
// tables that do not exist in this database — CRM, social, content and agent
// tables inherited from the fork. Keeping them was worse than useless: a
// query against one would have typechecked cleanly and failed at runtime.
//
// Regenerate with the command above after any migration. The migrations
// themselves live in the site repository, which owns the schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      collections: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          is_retouched: boolean
          name: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          is_retouched?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          is_retouched?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "folders_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      galleries: {
        Row: {
          collection_id: string
          cover_photo_id: string | null
          created_at: string
          downloads_enabled: boolean
          email_capture_enabled: boolean
          expiration_date: string | null
          id: string
          is_published: boolean
          name: string
          token: string
          updated_at: string
        }
        Insert: {
          collection_id: string
          cover_photo_id?: string | null
          created_at?: string
          downloads_enabled?: boolean
          email_capture_enabled?: boolean
          expiration_date?: string | null
          id?: string
          is_published?: boolean
          name: string
          token: string
          updated_at?: string
        }
        Update: {
          collection_id?: string
          cover_photo_id?: string | null
          created_at?: string
          downloads_enabled?: boolean
          email_capture_enabled?: boolean
          expiration_date?: string | null
          id?: string
          is_published?: boolean
          name?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "galleries_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_downloads: {
        Row: {
          downloaded_at: string
          gallery_id: string
          id: string
          photo_id: string | null
          visitor_id: string | null
        }
        Insert: {
          downloaded_at?: string
          gallery_id: string
          id?: string
          photo_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          downloaded_at?: string
          gallery_id?: string
          id?: string
          photo_id?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_downloads_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_downloads_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_downloads_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "gallery_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_emails: {
        Row: {
          error: string | null
          gallery_id: string
          id: string
          provider_id: string | null
          recipient: string
          sent_at: string
          status: string
          subject: string
        }
        Insert: {
          error?: string | null
          gallery_id: string
          id?: string
          provider_id?: string | null
          recipient: string
          sent_at?: string
          status: string
          subject: string
        }
        Update: {
          error?: string | null
          gallery_id?: string
          id?: string
          provider_id?: string | null
          recipient?: string
          sent_at?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_emails_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_favorites: {
        Row: {
          created_at: string
          gallery_id: string
          id: string
          photo_id: string
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          gallery_id: string
          id?: string
          photo_id: string
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          gallery_id?: string
          id?: string
          photo_id?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_favorites_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_favorites_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_favorites_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "gallery_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_folder_visibility: {
        Row: {
          folder_id: string
          gallery_id: string
          is_visible: boolean
        }
        Insert: {
          folder_id: string
          gallery_id: string
          is_visible?: boolean
        }
        Update: {
          folder_id?: string
          gallery_id?: string
          is_visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gallery_folder_visibility_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_folder_visibility_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_views: {
        Row: {
          gallery_id: string
          id: string
          viewed_at: string
          visitor_id: string | null
        }
        Insert: {
          gallery_id: string
          id?: string
          viewed_at?: string
          visitor_id?: string | null
        }
        Update: {
          gallery_id?: string
          id?: string
          viewed_at?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_views_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_views_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "gallery_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_visitors: {
        Row: {
          created_at: string
          email: string
          first_name: string
          gallery_id: string
          id: string
          last_name: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          gallery_id: string
          id?: string
          last_name: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          gallery_id?: string
          id?: string
          last_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_visitors_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          collection_id: string
          created_at: string
          file_size_bytes: number | null
          filename: string
          folder_id: string | null
          height: number | null
          id: string
          original_key: string
          preview_key: string
          sort_order: number
          thumbnail_key: string
          width: number | null
        }
        Insert: {
          collection_id: string
          created_at?: string
          file_size_bytes?: number | null
          filename: string
          folder_id?: string | null
          height?: number | null
          id?: string
          original_key: string
          preview_key: string
          sort_order?: number
          thumbnail_key: string
          width?: number | null
        }
        Update: {
          collection_id?: string
          created_at?: string
          file_size_bytes?: number | null
          filename?: string
          folder_id?: string | null
          height?: number | null
          id?: string
          original_key?: string
          preview_key?: string
          sort_order?: number
          thumbnail_key?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
