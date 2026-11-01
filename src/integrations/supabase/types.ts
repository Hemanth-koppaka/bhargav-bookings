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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_secret: {
        Row: {
          id: number
          pin: string
        }
        Insert: {
          id?: number
          pin: string
        }
        Update: {
          id?: number
          pin?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string
          id: number
          reason: string
          summary: string
        }
        Insert: {
          action: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string
          id?: number
          reason?: string
          summary?: string
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string
          id?: number
          reason?: string
          summary?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          archived_at: string | null
          audience: string
          booking_no: number | null
          buffer_minutes: number
          cancel_reason: string
          cancelled_at: string | null
          created_at: string
          customer: Json
          customer_id: string | null
          date: string
          duration_minutes: number | null
          ends_at_minute: number | null
          history: Json
          meta: Json
          notify_consent: boolean
          notify_consent_at: string | null
          payment: Json
          price_total: number | null
          reference: string
          service_ids: string[]
          services_snapshot: Json
          site_origin: string
          slots: number
          source: string
          status: string
          time: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audience: string
          booking_no?: number | null
          buffer_minutes?: number
          cancel_reason?: string
          cancelled_at?: string | null
          created_at?: string
          customer: Json
          customer_id?: string | null
          date: string
          duration_minutes?: number | null
          ends_at_minute?: number | null
          history?: Json
          meta?: Json
          notify_consent?: boolean
          notify_consent_at?: string | null
          payment?: Json
          price_total?: number | null
          reference: string
          service_ids?: string[]
          services_snapshot?: Json
          site_origin?: string
          slots?: number
          source?: string
          status?: string
          time: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audience?: string
          booking_no?: number | null
          buffer_minutes?: number
          cancel_reason?: string
          cancelled_at?: string | null
          created_at?: string
          customer?: Json
          customer_id?: string | null
          date?: string
          duration_minutes?: number | null
          ends_at_minute?: number | null
          history?: Json
          meta?: Json
          notify_consent?: boolean
          notify_consent_at?: string | null
          payment?: Json
          price_total?: number | null
          reference?: string
          service_ids?: string[]
          services_snapshot?: Json
          site_origin?: string
          slots?: number
          source?: string
          status?: string
          time?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          created_at: string
          email: string
          id: string
          marketing_consent: boolean
          name: string
          notes: string
          notify_consent: boolean
          notify_consent_at: string | null
          phone: string
          phone_key: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          email?: string
          id?: string
          marketing_consent?: boolean
          name?: string
          notes?: string
          notify_consent?: boolean
          notify_consent_at?: string | null
          phone?: string
          phone_key?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          email?: string
          id?: string
          marketing_consent?: boolean
          name?: string
          notes?: string
          notify_consent?: boolean
          notify_consent_at?: string | null
          phone?: string
          phone_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          booking_reference: string
          channel: string
          created_at: string
          detail: string
          event: string
          id: number
          status: string
        }
        Insert: {
          booking_reference: string
          channel: string
          created_at?: string
          detail?: string
          event: string
          id?: number
          status?: string
        }
        Update: {
          booking_reference?: string
          channel?: string
          created_at?: string
          detail?: string
          event?: string
          id?: number
          status?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          attempt_count: number
          booking_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          event_type: string
          id: number
          idempotency_key: string
          next_attempt_at: string | null
          payload: Json
          provider: string
          provider_message_id: string | null
          recipient_phone: string
          recipient_type: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          booking_id: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_type: string
          id?: number
          idempotency_key: string
          next_attempt_at?: string | null
          payload?: Json
          provider?: string
          provider_message_id?: string | null
          recipient_phone?: string
          recipient_type: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          booking_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          id?: number
          idempotency_key?: string
          next_attempt_at?: string | null
          payload?: Json
          provider?: string
          provider_message_id?: string | null
          recipient_phone?: string
          recipient_type?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          admin_new_booking_enabled: boolean
          admin_notification_phone: string
          admin_sms_enabled: boolean
          admin_updates_enabled: boolean
          admin_whatsapp_enabled: boolean
          customer_confirmation_enabled: boolean
          customer_reminder_24h: boolean
          customer_reminder_2h: boolean
          customer_sms_enabled: boolean
          customer_updates_enabled: boolean
          customer_whatsapp_enabled: boolean
          fallback_enabled: boolean
          id: number
          provider: string
          provider_config: Json
          public_site_url: string
          test_phone: string
          updated_at: string
        }
        Insert: {
          admin_new_booking_enabled?: boolean
          admin_notification_phone?: string
          admin_sms_enabled?: boolean
          admin_updates_enabled?: boolean
          admin_whatsapp_enabled?: boolean
          customer_confirmation_enabled?: boolean
          customer_reminder_24h?: boolean
          customer_reminder_2h?: boolean
          customer_sms_enabled?: boolean
          customer_updates_enabled?: boolean
          customer_whatsapp_enabled?: boolean
          fallback_enabled?: boolean
          id?: number
          provider?: string
          provider_config?: Json
          public_site_url?: string
          test_phone?: string
          updated_at?: string
        }
        Update: {
          admin_new_booking_enabled?: boolean
          admin_notification_phone?: string
          admin_sms_enabled?: boolean
          admin_updates_enabled?: boolean
          admin_whatsapp_enabled?: boolean
          customer_confirmation_enabled?: boolean
          customer_reminder_24h?: boolean
          customer_reminder_2h?: boolean
          customer_sms_enabled?: boolean
          customer_updates_enabled?: boolean
          customer_whatsapp_enabled?: boolean
          fallback_enabled?: boolean
          id?: number
          provider?: string
          provider_config?: Json
          public_site_url?: string
          test_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          channel: string
          enabled: boolean
          event: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel: string
          enabled?: boolean
          event: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          enabled?: boolean
          event?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      opening_exceptions: {
        Row: {
          closing_time: string | null
          date: string
          is_open: boolean
          note: string
          opening_time: string | null
          updated_at: string
        }
        Insert: {
          closing_time?: string | null
          date: string
          is_open?: boolean
          note?: string
          opening_time?: string | null
          updated_at?: string
        }
        Update: {
          closing_time?: string | null
          date?: string
          is_open?: boolean
          note?: string
          opening_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      opening_hours: {
        Row: {
          closing_time: string
          day_of_week: number
          is_open: boolean
          opening_time: string
          updated_at: string
        }
        Insert: {
          closing_time?: string
          day_of_week: number
          is_open?: boolean
          opening_time?: string
          updated_at?: string
        }
        Update: {
          closing_time?: string
          day_of_week?: number
          is_open?: boolean
          opening_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      salon_config: {
        Row: {
          data: Json
          id: number
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          active: boolean
          archived_at: string | null
          created_at: string
          description: string
          display_order: number
          gender: string
          id: string
          image_url: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          description?: string
          display_order?: number
          gender: string
          id: string
          image_url?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          description?: string
          display_order?: number
          gender?: string
          id?: string
          image_url?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          archived_at: string | null
          buffer_minutes: number
          category_id: string
          created_at: string
          description: string
          display_order: number
          duration_minutes: number
          featured: boolean
          gender: string
          id: string
          image_url: string
          name: string
          price: number
          price_from: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          buffer_minutes?: number
          category_id: string
          created_at?: string
          description?: string
          display_order?: number
          duration_minutes?: number
          featured?: boolean
          gender: string
          id: string
          image_url?: string
          name: string
          price?: number
          price_from?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          buffer_minutes?: number
          category_id?: string
          created_at?: string
          description?: string
          display_order?: number
          duration_minutes?: number
          featured?: boolean
          gender?: string
          id?: string
          image_url?: string
          name?: string
          price?: number
          price_from?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      time_blocks: {
        Row: {
          archived_at: string | null
          created_at: string
          date: string
          end_minute: number
          id: string
          kind: string
          reason: string
          start_minute: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          date: string
          end_minute: number
          id?: string
          kind?: string
          reason?: string
          start_minute: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          date?: string
          end_minute?: number
          id?: string
          kind?: string
          reason?: string
          start_minute?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_booking_reference: {
        Args: never
        Returns: {
          booking_no: number
          reference: string
        }[]
      }
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
