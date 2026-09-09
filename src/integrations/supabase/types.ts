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
      application_flags: {
        Row: {
          application_id: string
          category: string
          created_at: string
          created_by: string
          id: string
          note: string
          offering_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          category?: string
          created_at?: string
          created_by: string
          id?: string
          note: string
          offering_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          offering_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_flags_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_flags_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
      diligence_activity: {
        Row: {
          actor_email: string | null
          actor_id: string
          actor_name: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          offering_id: string
          room_id: string | null
          summary: string
        }
        Insert: {
          actor_email?: string | null
          actor_id: string
          actor_name?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          offering_id: string
          room_id?: string | null
          summary: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string
          actor_name?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          offering_id?: string
          room_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_activity_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_activity_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diligence_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_cap_table: {
        Row: {
          created_at: string
          created_by: string
          fully_diluted_pct: number | null
          holder_name: string
          holder_type: string
          id: string
          notes: string | null
          offering_id: string
          ownership_pct: number | null
          security_type: string
          shares: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          fully_diluted_pct?: number | null
          holder_name: string
          holder_type?: string
          id?: string
          notes?: string | null
          offering_id: string
          ownership_pct?: number | null
          security_type?: string
          shares?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          fully_diluted_pct?: number | null
          holder_name?: string
          holder_type?: string
          id?: string
          notes?: string | null
          offering_id?: string
          ownership_pct?: number | null
          security_type?: string
          shares?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_cap_table_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_checklist_items: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          document_id: string | null
          id: string
          is_required: boolean
          label: string
          offering_id: string
          room_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          document_id?: string | null
          id?: string
          is_required?: boolean
          label: string
          offering_id: string
          room_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          document_id?: string | null
          id?: string
          is_required?: boolean
          label?: string
          offering_id?: string
          room_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_checklist_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "diligence_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_checklist_items_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_checklist_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diligence_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_document_versions: {
        Row: {
          box_file_id: string
          document_id: string
          file_name: string
          id: string
          note: string | null
          offering_id: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          box_file_id: string
          document_id: string
          file_name: string
          id?: string
          note?: string | null
          offering_id: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by: string
          version: number
        }
        Update: {
          box_file_id?: string
          document_id?: string
          file_name?: string
          id?: string
          note?: string | null
          offering_id?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diligence_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "diligence_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_document_versions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_documents: {
        Row: {
          box_file_id: string
          category: string
          description: string | null
          file_name: string
          id: string
          offering_id: string
          room_id: string
          size_bytes: number | null
          title: string
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          box_file_id: string
          category: string
          description?: string | null
          file_name: string
          id?: string
          offering_id: string
          room_id: string
          size_bytes?: number | null
          title: string
          uploaded_at?: string
          uploaded_by: string
          version?: number
        }
        Update: {
          box_file_id?: string
          category?: string
          description?: string | null
          file_name?: string
          id?: string
          offering_id?: string
          room_id?: string
          size_bytes?: number | null
          title?: string
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diligence_documents_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_documents_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diligence_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_nda_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          nda_hash: string
          nda_version: number
          offering_id: string
          room_id: string
          signer_name: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          nda_hash: string
          nda_version: number
          offering_id: string
          room_id: string
          signer_name: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          nda_hash?: string
          nda_version?: number
          offering_id?: string
          room_id?: string
          signer_name?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_nda_acceptances_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_nda_acceptances_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diligence_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_question_messages: {
        Row: {
          author_id: string
          author_name: string | null
          body: string
          created_at: string
          from_reviewer: boolean
          id: string
          offering_id: string
          question_id: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          body: string
          created_at?: string
          from_reviewer?: boolean
          id?: string
          offering_id: string
          question_id: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string
          created_at?: string
          from_reviewer?: boolean
          id?: string
          offering_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_question_messages_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_question_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "diligence_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_questions: {
        Row: {
          asked_by: string
          asker_name: string | null
          body: string
          created_at: string
          id: string
          is_published: boolean
          offering_id: string
          room_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          asked_by: string
          asker_name?: string | null
          body: string
          created_at?: string
          id?: string
          is_published?: boolean
          offering_id: string
          room_id: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          asked_by?: string
          asker_name?: string | null
          body?: string
          created_at?: string
          id?: string
          is_published?: boolean
          offering_id?: string
          room_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_questions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_questions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diligence_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_rooms: {
        Row: {
          box_folder_id: string
          created_at: string
          created_by: string
          entity_type: string
          id: string
          intro: string | null
          nda_required: boolean
          nda_text: string | null
          nda_version: number
          offering_id: string
          updated_at: string
        }
        Insert: {
          box_folder_id: string
          created_at?: string
          created_by: string
          entity_type?: string
          id?: string
          intro?: string | null
          nda_required?: boolean
          nda_text?: string | null
          nda_version?: number
          offering_id: string
          updated_at?: string
        }
        Update: {
          box_folder_id?: string
          created_at?: string
          created_by?: string
          entity_type?: string
          id?: string
          intro?: string | null
          nda_required?: boolean
          nda_text?: string | null
          nda_version?: number
          offering_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_rooms_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          application_id: string
          box_error: string | null
          box_file_id: string | null
          box_folder_id: string | null
          box_uploaded_at: string | null
          consent_electronic: boolean
          document_hash: string
          id: string
          initials: string | null
          manager_notified_at: string | null
          offering_document_id: string
          pdf_path: string | null
          provider: string
          provider_agreement_id: string | null
          provider_completed_at: string | null
          provider_file_id: string | null
          provider_last_event_at: string | null
          provider_signing_url: string | null
          provider_source_file_id: string | null
          provider_status: string | null
          signature_type: string
          signature_value: string
          signed_at: string
          signer_email: string | null
          signer_name: string
        }
        Insert: {
          application_id: string
          box_error?: string | null
          box_file_id?: string | null
          box_folder_id?: string | null
          box_uploaded_at?: string | null
          consent_electronic?: boolean
          document_hash: string
          id?: string
          initials?: string | null
          manager_notified_at?: string | null
          offering_document_id: string
          pdf_path?: string | null
          provider?: string
          provider_agreement_id?: string | null
          provider_completed_at?: string | null
          provider_file_id?: string | null
          provider_last_event_at?: string | null
          provider_signing_url?: string | null
          provider_source_file_id?: string | null
          provider_status?: string | null
          signature_type?: string
          signature_value: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
        }
        Update: {
          application_id?: string
          box_error?: string | null
          box_file_id?: string | null
          box_folder_id?: string | null
          box_uploaded_at?: string | null
          consent_electronic?: boolean
          document_hash?: string
          id?: string
          initials?: string | null
          manager_notified_at?: string | null
          offering_document_id?: string
          pdf_path?: string | null
          provider?: string
          provider_agreement_id?: string | null
          provider_completed_at?: string | null
          provider_file_id?: string | null
          provider_last_event_at?: string | null
          provider_signing_url?: string | null
          provider_source_file_id?: string | null
          provider_status?: string | null
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
      email_link_clicks: {
        Row: {
          clicked_at: string
          id: string
          investor_email_id: string | null
          link_label: string | null
          recipient: string
          target_url: string
          template: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          investor_email_id?: string | null
          link_label?: string | null
          recipient: string
          target_url: string
          template?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          investor_email_id?: string | null
          link_label?: string | null
          recipient?: string
          target_url?: string
          template?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_link_clicks_investor_email_id_fkey"
            columns: ["investor_email_id"]
            isOneToOne: false
            referencedRelation: "investor_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_name: string | null
          last_sent_at: string | null
          offering_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_name?: string | null
          last_sent_at?: string | null
          offering_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_name?: string | null
          last_sent_at?: string | null
          offering_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_invitations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_managers: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          offering_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          offering_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          offering_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_managers_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_acknowledgements: {
        Row: {
          acknowledged_at: string
          application_id: string
          created_at: string
          id: string
          instructions_hash: string
          ip_address: string | null
          method: Database["public"]["Enums"]["funding_method"]
          statements: Json
          user_agent: string | null
        }
        Insert: {
          acknowledged_at?: string
          application_id: string
          created_at?: string
          id?: string
          instructions_hash: string
          ip_address?: string | null
          method: Database["public"]["Enums"]["funding_method"]
          statements?: Json
          user_agent?: string | null
        }
        Update: {
          acknowledged_at?: string
          application_id?: string
          created_at?: string
          id?: string
          instructions_hash?: string
          ip_address?: string | null
          method?: Database["public"]["Enums"]["funding_method"]
          statements?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_acknowledgements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
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
          source: string
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
          source?: string
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
          source?: string
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
      investor_documents: {
        Row: {
          application_id: string
          doc_kind: string
          file_name: string
          id: string
          note: string | null
          offering_id: string
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          doc_kind: string
          file_name: string
          id?: string
          note?: string | null
          offering_id: string
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          doc_kind?: string
          file_name?: string
          id?: string
          note?: string | null
          offering_id?: string
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_documents_offering_id_fkey"
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
      investor_fund_access: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          offering_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          offering_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          offering_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_fund_access_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
          didit_user_id: string | null
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
          didit_user_id?: string | null
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
          didit_user_id?: string | null
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
      login_attempts: {
        Row: {
          created_at: string
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      manager_onboarding_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          id: string
          note: string | null
          offering_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name: string
          id?: string
          note?: string | null
          offering_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          id?: string
          note?: string | null
          offering_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_onboarding_documents_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          amount_cents: number | null
          application_id: string | null
          claimed_at: string | null
          created_at: string
          error: string | null
          event_kind: string
          field: string | null
          id: string
          investor_user_id: string | null
          metadata: Json
          new_value: string | null
          offering_id: string
          old_value: string | null
          sent_at: string | null
        }
        Insert: {
          amount_cents?: number | null
          application_id?: string | null
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          event_kind: string
          field?: string | null
          id?: string
          investor_user_id?: string | null
          metadata?: Json
          new_value?: string | null
          offering_id: string
          old_value?: string | null
          sent_at?: string | null
        }
        Update: {
          amount_cents?: number | null
          application_id?: string | null
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          event_kind?: string
          field?: string | null
          id?: string
          investor_user_id?: string | null
          metadata?: Json
          new_value?: string | null
          offering_id?: string
          old_value?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          alerts_enabled: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alerts_enabled?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alerts_enabled?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      offering_audit_events: {
        Row: {
          actor_email: string | null
          actor_id: string
          actor_name: string | null
          changes: Json
          created_at: string
          event_type: string
          id: string
          offering_document_id: string | null
          offering_id: string
          summary: string
        }
        Insert: {
          actor_email?: string | null
          actor_id: string
          actor_name?: string | null
          changes?: Json
          created_at?: string
          event_type: string
          id?: string
          offering_document_id?: string | null
          offering_id: string
          summary?: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string
          actor_name?: string | null
          changes?: Json
          created_at?: string
          event_type?: string
          id?: string
          offering_document_id?: string | null
          offering_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_audit_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_documents: {
        Row: {
          body: string
          created_at: string
          doc_type: string
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
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
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
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
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
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
      offering_packet_links: {
        Row: {
          created_at: string
          created_by: string
          download_count: number
          expires_at: string | null
          id: string
          include_wire: boolean
          label: string
          last_downloaded_at: string | null
          offering_id: string
          revoked_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          download_count?: number
          expires_at?: string | null
          id?: string
          include_wire?: boolean
          label?: string
          last_downloaded_at?: string | null
          offering_id: string
          revoked_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          download_count?: number
          expires_at?: string | null
          id?: string
          include_wire?: boolean
          label?: string
          last_downloaded_at?: string | null
          offering_id?: string
          revoked_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_packet_links_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
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
      wire_confirmations: {
        Row: {
          amount_cents: number
          application_id: string
          bank_reference: string | null
          created_at: string
          id: string
          investor_note: string | null
          payment_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sending_account_last4: string
          sending_bank_name: string
          sent_on: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          application_id: string
          bank_reference?: string | null
          created_at?: string
          id?: string
          investor_note?: string | null
          payment_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sending_account_last4: string
          sending_bank_name: string
          sent_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          application_id?: string
          bank_reference?: string | null
          created_at?: string
          id?: string
          investor_note?: string | null
          payment_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sending_account_last4?: string
          sending_bank_name?: string
          sent_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wire_confirmations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wire_confirmations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_diligence: { Args: { _offering_id: string }; Returns: boolean }
      can_read_wire_instructions: {
        Args: { _offering_id: string }
        Returns: boolean
      }
      can_view_diligence: { Args: { _offering_id: string }; Returns: boolean }
      diligence_access_open: {
        Args: { _offering_id: string }
        Returns: boolean
      }
      get_wire_instructions: {
        Args: { p_offering_id: string }
        Returns: {
          details: Json
          offering_id: string
          updated_at: string
        }[]
      }
      get_wire_instructions_for_packet: {
        Args: { p_offering_id: string }
        Returns: Json
      }
      list_wire_instructions: {
        Args: never
        Returns: {
          details: Json
          offering_id: string
          updated_at: string
        }[]
      }
      save_wire_instructions: {
        Args: { p_details: Json; p_offering_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "investor" | "fund_manager"
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
      app_role: ["admin", "investor", "fund_manager"],
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
