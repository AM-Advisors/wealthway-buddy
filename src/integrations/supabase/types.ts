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
      accreditation_documents: {
        Row: {
          application_id: string
          doc_kind: string
          file_name: string
          id: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          application_id: string
          doc_kind: string
          file_name: string
          id?: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          doc_kind?: string
          file_name?: string
          id?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accreditation_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      accreditation_records: {
        Row: {
          application_id: string
          attested_at: string | null
          attested_signature: string | null
          created_at: string
          expires_at: string | null
          id: string
          method: string | null
          pre_existing_relationship: string | null
          qualifies: boolean | null
          questionnaire: Json
          reg_type: Database["public"]["Enums"]["reg_type"]
          review_notes: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["check_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          application_id: string
          attested_at?: string | null
          attested_signature?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          method?: string | null
          pre_existing_relationship?: string | null
          qualifies?: boolean | null
          questionnaire?: Json
          reg_type: Database["public"]["Enums"]["reg_type"]
          review_notes?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          application_id?: string
          attested_at?: string | null
          attested_signature?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          method?: string | null
          pre_existing_relationship?: string | null
          qualifies?: boolean | null
          questionnaire?: Json
          reg_type?: Database["public"]["Enums"]["reg_type"]
          review_notes?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accreditation_records_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          application_id: string
          author_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          application_id: string
          author_id: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          application_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_screenings: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string
          id: string
          matches: Json
          provider: string
          report_id: string | null
          status: Database["public"]["Enums"]["check_status"]
          updated_at: string
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          matches?: Json
          provider?: string
          report_id?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          matches?: Json
          provider?: string
          report_id?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_screenings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      didit_webhook_events: {
        Row: {
          application_id: string | null
          error: string | null
          event_id: string
          payload: Json
          processed_at: string | null
          received_at: string
          session_id: string | null
          status: string | null
          webhook_type: string
        }
        Insert: {
          application_id?: string | null
          error?: string | null
          event_id: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          session_id?: string | null
          status?: string | null
          webhook_type: string
        }
        Update: {
          application_id?: string | null
          error?: string | null
          event_id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          session_id?: string | null
          status?: string | null
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "didit_webhook_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          application_id: string
          consent_electronic: boolean
          document_hash: string
          id: string
          initials: string | null
          offering_document_id: string
          pdf_path: string | null
          signature_type: string
          signature_value: string
          signed_at: string
          signer_email: string | null
          signer_name: string
        }
        Insert: {
          application_id: string
          consent_electronic?: boolean
          document_hash: string
          id?: string
          initials?: string | null
          offering_document_id: string
          pdf_path?: string | null
          signature_type?: string
          signature_value: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
        }
        Update: {
          application_id?: string
          consent_electronic?: boolean
          document_hash?: string
          id?: string
          initials?: string | null
          offering_document_id?: string
          pdf_path?: string | null
          signature_type?: string
          signature_value?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_offering_document_id_fkey"
            columns: ["offering_document_id"]
            isOneToOne: false
            referencedRelation: "offering_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          event_id: string
          event_type: string
          investor_email_id: string | null
          message_id: string | null
          payload: Json
          received_at: string
          recipient: string
        }
        Insert: {
          event_id: string
          event_type: string
          investor_email_id?: string | null
          message_id?: string | null
          payload?: Json
          received_at?: string
          recipient: string
        }
        Update: {
          event_id?: string
          event_type?: string
          investor_email_id?: string | null
          message_id?: string | null
          payload?: Json
          received_at?: string
          recipient?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_events_investor_email_id_fkey"
            columns: ["investor_email_id"]
            isOneToOne: false
            referencedRelation: "investor_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_applications: {
        Row: {
          accreditation_status: Database["public"]["Enums"]["check_status"]
          aml_status: Database["public"]["Enums"]["check_status"]
          commitment_cents: number | null
          created_at: string
          current_step: string
          documents_status: Database["public"]["Enums"]["check_status"]
          funding_status: Database["public"]["Enums"]["payment_status"]
          id: string
          kyc_status: Database["public"]["Enums"]["check_status"]
          offering_id: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accreditation_status?: Database["public"]["Enums"]["check_status"]
          aml_status?: Database["public"]["Enums"]["check_status"]
          commitment_cents?: number | null
          created_at?: string
          current_step?: string
          documents_status?: Database["public"]["Enums"]["check_status"]
          funding_status?: Database["public"]["Enums"]["payment_status"]
          id?: string
          kyc_status?: Database["public"]["Enums"]["check_status"]
          offering_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accreditation_status?: Database["public"]["Enums"]["check_status"]
          aml_status?: Database["public"]["Enums"]["check_status"]
          commitment_cents?: number | null
          created_at?: string
          current_step?: string
          documents_status?: Database["public"]["Enums"]["check_status"]
          funding_status?: Database["public"]["Enums"]["payment_status"]
          id?: string
          kyc_status?: Database["public"]["Enums"]["check_status"]
          offering_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_applications_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_emails: {
        Row: {
          application_id: string
          body: string
          created_at: string
          delivery_detail: string | null
          delivery_event: string | null
          delivery_event_at: string | null
          id: string
          provider_error: string | null
          sent_by: string
          status: string
          subject: string
          to_email: string
          updated_at: string
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          delivery_detail?: string | null
          delivery_event?: string | null
          delivery_event_at?: string | null
          id?: string
          provider_error?: string | null
          sent_by: string
          status?: string
          subject: string
          to_email: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          delivery_detail?: string | null
          delivery_event?: string | null
          delivery_event_at?: string | null
          id?: string
          provider_error?: string | null
          sent_by?: string
          status?: string
          subject?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_emails_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verifications: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string
          decision: Json
          expired_at: string | null
          id: string
          inquiry_id: string | null
          provider: string
          result: Json
          session_id: string | null
          session_url: string | null
          status: Database["public"]["Enums"]["check_status"]
          updated_at: string
          vendor_data: string | null
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string
          decision?: Json
          expired_at?: string | null
          id?: string
          inquiry_id?: string | null
          provider?: string
          result?: Json
          session_id?: string | null
          session_url?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
          vendor_data?: string | null
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string
          decision?: Json
          expired_at?: string | null
          id?: string
          inquiry_id?: string | null
          provider?: string
          result?: Json
          session_id?: string | null
          session_url?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
          vendor_data?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_verifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_documents: {
        Row: {
          body: string
          created_at: string
          doc_type: string
          id: string
          offering_id: string
          requires_signature: boolean
          sort_order: number
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          doc_type: string
          id?: string
          offering_id: string
          requires_signature?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          doc_type?: string
          id?: string
          offering_id?: string
          requires_signature?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_documents_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_wire_instructions: {
        Row: {
          details: Json
          offering_id: string
          updated_at: string
        }
        Insert: {
          details?: Json
          offering_id: string
          updated_at?: string
        }
        Update: {
          details?: Json
          offering_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_wire_instructions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          created_at: string
          id: string
          is_open: boolean
          min_investment_cents: number
          name: string
          reg_type: Database["public"]["Enums"]["reg_type"]
          slug: string
          summary: string | null
          target_raise_cents: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_open?: boolean
          min_investment_cents?: number
          name: string
          reg_type: Database["public"]["Enums"]["reg_type"]
          slug: string
          summary?: string | null
          target_raise_cents?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_open?: boolean
          min_investment_cents?: number
          name?: string
          reg_type?: Database["public"]["Enums"]["reg_type"]
          slug?: string
          summary?: string | null
          target_raise_cents?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          application_id: string
          bank_last4: string | null
          confirmed_at: string | null
          created_at: string
          expected_date: string | null
          failure_reason: string | null
          id: string
          method: Database["public"]["Enums"]["funding_method"]
          provider: string | null
          provider_payment_id: string | null
          reference_code: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          application_id: string
          bank_last4?: string | null
          confirmed_at?: string | null
          created_at?: string
          expected_date?: string | null
          failure_reason?: string | null
          id?: string
          method: Database["public"]["Enums"]["funding_method"]
          provider?: string | null
          provider_payment_id?: string | null
          reference_code?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          application_id?: string
          bank_last4?: string | null
          confirmed_at?: string | null
          created_at?: string
          expected_date?: string | null
          failure_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["funding_method"]
          provider?: string | null
          provider_payment_id?: string | null
          reference_code?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          entity_name: string | null
          id: string
          investor_type: Database["public"]["Enums"]["investor_type"] | null
          legal_name: string | null
          phone: string | null
          postal_code: string | null
          region: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          entity_name?: string | null
          id?: string
          investor_type?: Database["public"]["Enums"]["investor_type"] | null
          legal_name?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          entity_name?: string | null
          id?: string
          investor_type?: Database["public"]["Enums"]["investor_type"] | null
          legal_name?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signature_audit_events: {
        Row: {
          application_id: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          signature_id: string | null
          user_agent: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          signature_id?: string | null
          user_agent?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          signature_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_audit_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_audit_events_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          application_id: string
          commitment_cents: number
          created_at: string
          id: string
          ownership_title: string | null
          status: string
          tax_classification: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          commitment_cents: number
          created_at?: string
          id?: string
          ownership_title?: string | null
          status?: string
          tax_classification?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          commitment_cents?: number
          created_at?: string
          id?: string
          ownership_title?: string | null
          status?: string
          tax_classification?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "investor"
      check_status:
        | "not_started"
        | "pending"
        | "review"
        | "approved"
        | "declined"
      funding_method: "wire" | "ach"
      investor_type: "individual" | "joint" | "entity" | "trust" | "ira"
      payment_status:
        | "not_started"
        | "awaiting_wire"
        | "processing"
        | "settled"
        | "failed"
        | "returned"
        | "cancelled"
      reg_type: "506b" | "506c"
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
    Enums: {
      app_role: ["admin", "investor"],
      check_status: [
        "not_started",
        "pending",
        "review",
        "approved",
        "declined",
      ],
      funding_method: ["wire", "ach"],
      investor_type: ["individual", "joint", "entity", "trust", "ira"],
      payment_status: [
        "not_started",
        "awaiting_wire",
        "processing",
        "settled",
        "failed",
        "returned",
        "cancelled",
      ],
      reg_type: ["506b", "506c"],
    },
  },
} as const
