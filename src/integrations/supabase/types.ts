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
      agreement_change_messages: {
        Row: {
          author_id: string | null
          author_name: string | null
          author_side: string
          body: string | null
          change_request_id: string
          created_at: string
          id: string
          proposed_text: string | null
          status_after: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          author_side: string
          body?: string | null
          change_request_id: string
          created_at?: string
          id?: string
          proposed_text?: string | null
          status_after?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          author_side?: string
          body?: string | null
          change_request_id?: string
          created_at?: string
          id?: string
          proposed_text?: string | null
          status_after?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_change_messages_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "agreement_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_change_requests: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          final_text: string | null
          harmonious_response: string | null
          id: string
          msa_agreement_id: string | null
          original_text: string
          reason: string | null
          requested_text: string
          resolved_at: string | null
          responded_at: string | null
          responded_by: string | null
          scope: string
          section_key: string | null
          section_no: string | null
          section_title: string
          sow_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          final_text?: string | null
          harmonious_response?: string | null
          id?: string
          msa_agreement_id?: string | null
          original_text: string
          reason?: string | null
          requested_text: string
          resolved_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          scope: string
          section_key?: string | null
          section_no?: string | null
          section_title: string
          sow_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          final_text?: string | null
          harmonious_response?: string | null
          id?: string
          msa_agreement_id?: string | null
          original_text?: string
          reason?: string | null
          requested_text?: string
          resolved_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          scope?: string
          section_key?: string | null
          section_no?: string | null
          section_title?: string
          sow_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_change_requests_msa_agreement_id_fkey"
            columns: ["msa_agreement_id"]
            isOneToOne: false
            referencedRelation: "client_msa_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_change_requests_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_executions: {
        Row: {
          amendment_id: string | null
          client_id: string
          created_at: string
          document_path: string | null
          executed_at: string
          id: string
          msa_agreement_id: string | null
          scope: string
          snapshot: Json
          sow_id: string | null
        }
        Insert: {
          amendment_id?: string | null
          client_id: string
          created_at?: string
          document_path?: string | null
          executed_at?: string
          id?: string
          msa_agreement_id?: string | null
          scope: string
          snapshot: Json
          sow_id?: string | null
        }
        Update: {
          amendment_id?: string | null
          client_id?: string
          created_at?: string
          document_path?: string | null
          executed_at?: string
          id?: string
          msa_agreement_id?: string | null
          scope?: string
          snapshot?: Json
          sow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_executions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_executions_msa_agreement_id_fkey"
            columns: ["msa_agreement_id"]
            isOneToOne: false
            referencedRelation: "client_msa_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_executions_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_signatures: {
        Row: {
          amendment_id: string | null
          client_id: string
          company: string | null
          id: string
          ip_address: string | null
          msa_agreement_id: string | null
          scope: string
          side: string
          signed_at: string
          signer_email: string | null
          signer_name: string
          signer_title: string | null
          signer_user_id: string | null
          sow_id: string | null
          typed_signature: string
          user_agent: string | null
          version_label: string | null
        }
        Insert: {
          amendment_id?: string | null
          client_id: string
          company?: string | null
          id?: string
          ip_address?: string | null
          msa_agreement_id?: string | null
          scope: string
          side: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          signer_title?: string | null
          signer_user_id?: string | null
          sow_id?: string | null
          typed_signature: string
          user_agent?: string | null
          version_label?: string | null
        }
        Update: {
          amendment_id?: string | null
          client_id?: string
          company?: string | null
          id?: string
          ip_address?: string | null
          msa_agreement_id?: string | null
          scope?: string
          side?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          signer_title?: string | null
          signer_user_id?: string | null
          sow_id?: string | null
          typed_signature?: string
          user_agent?: string | null
          version_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_signatures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_signatures_msa_agreement_id_fkey"
            columns: ["msa_agreement_id"]
            isOneToOne: false
            referencedRelation: "client_msa_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_signatures_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          client_id: string | null
          created_at: string
          feature: string
          human_review_required: boolean
          id: string
          offering_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          client_id?: string | null
          created_at?: string
          feature: string
          human_review_required?: boolean
          id?: string
          offering_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          client_id?: string | null
          created_at?: string
          feature?: string
          human_review_required?: boolean
          id?: string
          offering_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_log_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
      application_closings: {
        Row: {
          application_id: string
          closed_at: string
          closed_by: string
          closing_date: string
          created_at: string
          funded_amount_cents: number
          id: string
          note: string | null
          offering_id: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          closed_at?: string
          closed_by: string
          closing_date: string
          created_at?: string
          funded_amount_cents: number
          id?: string
          note?: string | null
          offering_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          closed_at?: string
          closed_by?: string
          closing_date?: string
          created_at?: string
          funded_amount_cents?: number
          id?: string
          note?: string | null
          offering_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_closings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_closings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
      bank_accounts: {
        Row: {
          account_mask: string | null
          account_name: string | null
          created_at: string
          created_by: string
          id: string
          institution_name: string | null
          item_id: string
          last_synced_at: string | null
          offering_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_mask?: string | null
          account_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          institution_name?: string | null
          item_id: string
          last_synced_at?: string | null
          offering_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_mask?: string | null
          account_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          institution_name?: string | null
          item_id?: string
          last_synced_at?: string | null
          offering_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount_cents: number
          auto_matched: boolean
          created_at: string
          description: string | null
          id: string
          invoice_matched_at: string | null
          invoice_matched_by: string | null
          matched_application_id: string | null
          matched_at: string | null
          matched_by: string | null
          matched_invoice_id: string | null
          matched_wire_request_id: string | null
          name: string
          offering_id: string
          plaid_transaction_id: string
          posted_on: string
          updated_at: string
          wire_matched_at: string | null
          wire_matched_by: string | null
        }
        Insert: {
          amount_cents: number
          auto_matched?: boolean
          created_at?: string
          description?: string | null
          id?: string
          invoice_matched_at?: string | null
          invoice_matched_by?: string | null
          matched_application_id?: string | null
          matched_at?: string | null
          matched_by?: string | null
          matched_invoice_id?: string | null
          matched_wire_request_id?: string | null
          name: string
          offering_id: string
          plaid_transaction_id: string
          posted_on: string
          updated_at?: string
          wire_matched_at?: string | null
          wire_matched_by?: string | null
        }
        Update: {
          amount_cents?: number
          auto_matched?: boolean
          created_at?: string
          description?: string | null
          id?: string
          invoice_matched_at?: string | null
          invoice_matched_by?: string | null
          matched_application_id?: string | null
          matched_at?: string | null
          matched_by?: string | null
          matched_invoice_id?: string | null
          matched_wire_request_id?: string | null
          name?: string
          offering_id?: string
          plaid_transaction_id?: string
          posted_on?: string
          updated_at?: string
          wire_matched_at?: string | null
          wire_matched_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_matched_application_id_fkey"
            columns: ["matched_application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_wire_request_id_fkey"
            columns: ["matched_wire_request_id"]
            isOneToOne: false
            referencedRelation: "wire_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_certificates: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          certificate_no: string
          client_id: string
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string | null
          holding_id: string
          id: string
          replaced_by: string | null
          signature_ip: string | null
          signature_user_agent: string | null
          signed_at: string | null
          signed_by: string | null
          signer_name: string | null
          signer_title: string | null
          snapshot: Json
          stakeholder_id: string
          status: string
          transfer_id: string | null
          updated_at: string
          uploaded_at: string | null
          verification_code: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          certificate_no: string
          client_id: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          holding_id: string
          id?: string
          replaced_by?: string | null
          signature_ip?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signer_name?: string | null
          signer_title?: string | null
          snapshot?: Json
          stakeholder_id: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
          uploaded_at?: string | null
          verification_code: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          certificate_no?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          holding_id?: string
          id?: string
          replaced_by?: string | null
          signature_ip?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signer_name?: string | null
          signer_title?: string | null
          snapshot?: Json
          stakeholder_id?: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
          uploaded_at?: string | null
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_certificates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_certificates_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "cap_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_certificates_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "cap_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_certificates_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "cap_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_certificates_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "cap_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_holder_access: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          expires_at: string | null
          id: string
          invited_by: string | null
          kind: string
          last_seen_at: string | null
          revoked_at: string | null
          stakeholder_id: string
          token_hash: string | null
          updated_at: string
          user_id: string | null
          view_count: number
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          kind: string
          last_seen_at?: string | null
          revoked_at?: string | null
          stakeholder_id: string
          token_hash?: string | null
          updated_at?: string
          user_id?: string | null
          view_count?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          kind?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          stakeholder_id?: string
          token_hash?: string | null
          updated_at?: string
          user_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "cap_holder_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_holder_access_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "cap_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_holdings: {
        Row: {
          certificate_no: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          issued_on: string | null
          notes: string | null
          parent_holding_id: string | null
          price_per_share_cents: number | null
          quantity: number
          security_type: string
          share_class: string | null
          source: string
          stakeholder_id: string
          status: string
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          certificate_no?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          parent_holding_id?: string | null
          price_per_share_cents?: number | null
          quantity?: number
          security_type?: string
          share_class?: string | null
          source?: string
          stakeholder_id: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          certificate_no?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          parent_holding_id?: string | null
          price_per_share_cents?: number | null
          quantity?: number
          security_type?: string
          share_class?: string | null
          source?: string
          stakeholder_id?: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_holdings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_holdings_parent_holding_id_fkey"
            columns: ["parent_holding_id"]
            isOneToOne: false
            referencedRelation: "cap_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_holdings_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "cap_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_holdings_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "cap_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_onboarding: {
        Row: {
          acknowledged: boolean
          authorized_shares: number | null
          client_id: string
          company_legal_name: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          date_formed: string | null
          entity_type: string | null
          fiscal_year_end: string | null
          id: string
          par_value_cents: number | null
          records_source: string | null
          signatory_email: string | null
          signatory_name: string | null
          signatory_title: string | null
          state_formed: string | null
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          authorized_shares?: number | null
          client_id: string
          company_legal_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          date_formed?: string | null
          entity_type?: string | null
          fiscal_year_end?: string | null
          id?: string
          par_value_cents?: number | null
          records_source?: string | null
          signatory_email?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          state_formed?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          authorized_shares?: number | null
          client_id?: string
          company_legal_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          date_formed?: string | null
          entity_type?: string | null
          fiscal_year_end?: string | null
          id?: string
          par_value_cents?: number | null
          records_source?: string | null
          signatory_email?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          state_formed?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_onboarding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_stakeholders: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          email: string | null
          holder_type: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          holder_type?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          holder_type?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_stakeholders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_table_changes: {
        Row: {
          application_id: string
          changed_by: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          note: string | null
          offering_id: string
          old_value: string | null
        }
        Insert: {
          application_id: string
          changed_by?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          note?: string | null
          offering_id: string
          old_value?: string | null
        }
        Update: {
          application_id?: string
          changed_by?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          note?: string | null
          offering_id?: string
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cap_table_changes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_table_changes_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_table_leads: {
        Row: {
          assigned_to: string | null
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          internal_note: string | null
          note: string | null
          shareholder_count: number | null
          source_provider: string
          status: string
          submitted_ip: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_name: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          internal_note?: string | null
          note?: string | null
          shareholder_count?: number | null
          source_provider?: string
          status?: string
          submitted_ip?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          internal_note?: string | null
          note?: string | null
          shareholder_count?: number | null
          source_provider?: string
          status?: string
          submitted_ip?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cap_transfers: {
        Row: {
          client_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_stakeholder_id: string | null
          holding_id: string
          id: string
          quantity: number
          reason: string | null
          requested_by: string | null
          status: string
          to_email: string | null
          to_name: string | null
          to_stakeholder_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_stakeholder_id?: string | null
          holding_id: string
          id?: string
          quantity: number
          reason?: string | null
          requested_by?: string | null
          status?: string
          to_email?: string | null
          to_name?: string | null
          to_stakeholder_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_stakeholder_id?: string | null
          holding_id?: string
          id?: string
          quantity?: number
          reason?: string | null
          requested_by?: string | null
          status?: string
          to_email?: string | null
          to_name?: string | null
          to_stakeholder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_transfers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_transfers_from_stakeholder_id_fkey"
            columns: ["from_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "cap_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_transfers_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "cap_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cap_transfers_to_stakeholder_id_fkey"
            columns: ["to_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "cap_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_account_statements: {
        Row: {
          application_id: string
          closing_id: string | null
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          offering_id: string
          period_end: string | null
          snapshot: Json
          statement_date: string
          superseded: boolean
          updated_at: string
          version: number
        }
        Insert: {
          application_id: string
          closing_id?: string | null
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          offering_id: string
          period_end?: string | null
          snapshot?: Json
          statement_date?: string
          superseded?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          application_id?: string
          closing_id?: string | null
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          offering_id?: string
          period_end?: string | null
          snapshot?: Json
          statement_date?: string
          superseded?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "capital_account_statements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_account_statements_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "application_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_account_statements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_lines: {
        Row: {
          action: string
          agreed_price_cents: number
          billing_frequency: string
          change_order_id: string
          created_at: string
          discount_cents: number
          effective_date: string | null
          engagement_service_id: string | null
          id: string
          note: string | null
          pass_through: boolean
          pricing_model: string
          scope: string | null
          service_id: string | null
          service_key: string
          service_name: string
          standard_price_cents: number
        }
        Insert: {
          action?: string
          agreed_price_cents?: number
          billing_frequency?: string
          change_order_id: string
          created_at?: string
          discount_cents?: number
          effective_date?: string | null
          engagement_service_id?: string | null
          id?: string
          note?: string | null
          pass_through?: boolean
          pricing_model?: string
          scope?: string | null
          service_id?: string | null
          service_key: string
          service_name: string
          standard_price_cents?: number
        }
        Update: {
          action?: string
          agreed_price_cents?: number
          billing_frequency?: string
          change_order_id?: string
          created_at?: string
          discount_cents?: number
          effective_date?: string | null
          engagement_service_id?: string | null
          id?: string
          note?: string | null
          pass_through?: boolean
          pricing_model?: string
          scope?: string | null
          service_id?: string | null
          service_key?: string
          service_name?: string
          standard_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "change_order_lines_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "engagement_change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_lines_engagement_service_id_fkey"
            columns: ["engagement_service_id"]
            isOneToOne: false
            referencedRelation: "engagement_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_lines_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          assigned_by: string | null
          assignment_role: string
          client_id: string
          created_at: string
          id: string
          note: string | null
          staff_user_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_role?: string
          client_id: string
          created_at?: string
          id?: string
          note?: string | null
          staff_user_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assignment_role?: string
          client_id?: string
          created_at?: string
          id?: string
          note?: string | null
          staff_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_bank_accounts: {
        Row: {
          account_holder: string
          account_last4: string | null
          account_type: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          institution_name: string
          is_primary: boolean
          label: string | null
          notes: string | null
          reference_hint: string | null
          routing_last4: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_holder: string
          account_last4?: string | null
          account_type?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_name: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          reference_hint?: string | null
          routing_last4?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_holder?: string
          account_last4?: string | null
          account_type?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_name?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          reference_hint?: string | null
          routing_last4?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_bank_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_engagements: {
        Row: {
          billing_frequency: string
          client_id: string
          created_at: string
          created_by: string | null
          delivery_status: string
          discount_kind: string | null
          discount_reason: string | null
          discount_value: number | null
          effective_date: string | null
          entity_id: string | null
          first_invoice_date: string | null
          id: string
          notes: string | null
          service_terms: string | null
          sow_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          billing_frequency?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          delivery_status?: string
          discount_kind?: string | null
          discount_reason?: string | null
          discount_value?: number | null
          effective_date?: string | null
          entity_id?: string | null
          first_invoice_date?: string | null
          id?: string
          notes?: string | null
          service_terms?: string | null
          sow_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          billing_frequency?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          delivery_status?: string
          discount_kind?: string | null
          discount_reason?: string | null
          discount_value?: number | null
          effective_date?: string | null
          entity_id?: string | null
          first_invoice_date?: string | null
          id?: string
          notes?: string | null
          service_terms?: string | null
          sow_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_engagements_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      client_entities: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          entity_type: string
          formation_date: string | null
          id: string
          jurisdiction: string | null
          legal_name: string
          notes: string | null
          offering_id: string | null
          parent_entity_id: string | null
          short_name: string | null
          status: string
          tax_id_masked: string | null
          tax_id_status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          entity_type?: string
          formation_date?: string | null
          id?: string
          jurisdiction?: string | null
          legal_name: string
          notes?: string | null
          offering_id?: string | null
          parent_entity_id?: string | null
          short_name?: string | null
          status?: string
          tax_id_masked?: string | null
          tax_id_status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          entity_type?: string
          formation_date?: string | null
          id?: string
          jurisdiction?: string | null
          legal_name?: string
          notes?: string | null
          offering_id?: string | null
          parent_entity_id?: string | null
          short_name?: string | null
          status?: string
          tax_id_masked?: string | null
          tax_id_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_entities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_entities_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_entities_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      client_fund_intakes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          details: Json
          id: string
          offering_id: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          offering_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          offering_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_fund_intakes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_fund_intakes_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      client_intake_requests: {
        Row: {
          answers: Json
          assigned_to: string | null
          client_id: string
          created_at: string
          engagement_id: string | null
          entity_id: string | null
          id: string
          intent: string
          requested_by: string | null
          requested_service_keys: string[]
          resulting_engagement_id: string | null
          staff_note: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          assigned_to?: string | null
          client_id: string
          created_at?: string
          engagement_id?: string | null
          entity_id?: string | null
          id?: string
          intent: string
          requested_by?: string | null
          requested_service_keys?: string[]
          resulting_engagement_id?: string | null
          staff_note?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          assigned_to?: string | null
          client_id?: string
          created_at?: string
          engagement_id?: string | null
          entity_id?: string | null
          id?: string
          intent?: string
          requested_by?: string | null
          requested_service_keys?: string[]
          resulting_engagement_id?: string | null
          staff_note?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_intake_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intake_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intake_requests_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intake_requests_resulting_engagement_id_fkey"
            columns: ["resulting_engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          can_approve: boolean
          client_id: string
          client_role: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_note: string | null
          invite_sent_at: string | null
          invite_status: string | null
          invited_by: string | null
          invited_name: string | null
          note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          can_approve?: boolean
          client_id: string
          client_role?: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_note?: string | null
          invite_sent_at?: string | null
          invite_status?: string | null
          invited_by?: string | null
          invited_name?: string | null
          note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          can_approve?: boolean
          client_id?: string
          client_role?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_note?: string | null
          invite_sent_at?: string | null
          invite_status?: string | null
          invited_by?: string | null
          invited_name?: string | null
          note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          body_html: string
          client_id: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          preview: string | null
          read_at: string | null
          recipient_email: string
          subject: string
          template: string
          user_id: string
        }
        Insert: {
          body_html: string
          client_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          preview?: string | null
          read_at?: string | null
          recipient_email: string
          subject: string
          template: string
          user_id: string
        }
        Update: {
          body_html?: string
          client_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          preview?: string | null
          read_at?: string | null
          recipient_email?: string
          subject?: string
          template?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_msa_agreements: {
        Row: {
          client_approved_at: string | null
          client_id: string
          created_at: string
          document_path: string | null
          executed_at: string | null
          id: string
          msa_version_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_approved_at?: string | null
          client_id: string
          created_at?: string
          document_path?: string | null
          executed_at?: string | null
          id?: string
          msa_version_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_approved_at?: string | null
          client_id?: string
          created_at?: string
          document_path?: string | null
          executed_at?: string | null
          id?: string
          msa_version_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_msa_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_msa_agreements_msa_version_id_fkey"
            columns: ["msa_version_id"]
            isOneToOne: false
            referencedRelation: "msa_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pricing: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          contracted_cents: number | null
          created_at: string
          discount_note: string | null
          effective_date: string | null
          id: string
          label: string
          pricing_model: string
          service_key: string | null
          sow_id: string | null
          standard_cents: number | null
          updated_at: string
          version_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          contracted_cents?: number | null
          created_at?: string
          discount_note?: string | null
          effective_date?: string | null
          id?: string
          label: string
          pricing_model?: string
          service_key?: string | null
          sow_id?: string | null
          standard_cents?: number | null
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          contracted_cents?: number | null
          created_at?: string
          discount_note?: string | null
          effective_date?: string | null
          id?: string
          label?: string
          pricing_model?: string
          service_key?: string | null
          sow_id?: string | null
          standard_cents?: number | null
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pricing_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pricing_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "pricing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sows: {
        Row: {
          approval_note: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          assigned_reviewer: string | null
          client_final_approved_at: string | null
          client_id: string
          client_sent_back_at: string | null
          client_sent_back_reason: string | null
          client_signature_ip: string | null
          client_signature_name: string | null
          client_signature_title: string | null
          client_signature_user_agent: string | null
          client_signed_at: string | null
          client_signed_user_id: string | null
          client_status: string
          created_at: string
          created_by: string | null
          document_path: string | null
          effective_date: string | null
          eligibility: Json
          executed_at: string | null
          fund_request_id: string | null
          id: string
          locked: boolean
          msa_version_id: string | null
          notes: string | null
          notice_days: number
          offering_id: string | null
          signed_by: string | null
          signed_on: string | null
          sow_type: string
          sow_version: number
          special_terms: string | null
          stage: string
          status: string
          termination_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_reviewer?: string | null
          client_final_approved_at?: string | null
          client_id: string
          client_sent_back_at?: string | null
          client_sent_back_reason?: string | null
          client_signature_ip?: string | null
          client_signature_name?: string | null
          client_signature_title?: string | null
          client_signature_user_agent?: string | null
          client_signed_at?: string | null
          client_signed_user_id?: string | null
          client_status?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          effective_date?: string | null
          eligibility?: Json
          executed_at?: string | null
          fund_request_id?: string | null
          id?: string
          locked?: boolean
          msa_version_id?: string | null
          notes?: string | null
          notice_days?: number
          offering_id?: string | null
          signed_by?: string | null
          signed_on?: string | null
          sow_type?: string
          sow_version?: number
          special_terms?: string | null
          stage?: string
          status?: string
          termination_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_reviewer?: string | null
          client_final_approved_at?: string | null
          client_id?: string
          client_sent_back_at?: string | null
          client_sent_back_reason?: string | null
          client_signature_ip?: string | null
          client_signature_name?: string | null
          client_signature_title?: string | null
          client_signature_user_agent?: string | null
          client_signed_at?: string | null
          client_signed_user_id?: string | null
          client_status?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          effective_date?: string | null
          eligibility?: Json
          executed_at?: string | null
          fund_request_id?: string | null
          id?: string
          locked?: boolean
          msa_version_id?: string | null
          notes?: string | null
          notice_days?: number
          offering_id?: string | null
          signed_by?: string | null
          signed_on?: string | null
          sow_type?: string
          sow_version?: number
          special_terms?: string | null
          stage?: string
          status?: string
          termination_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sows_fund_request_id_fkey"
            columns: ["fund_request_id"]
            isOneToOne: false
            referencedRelation: "fund_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sows_msa_version_id_fkey"
            columns: ["msa_version_id"]
            isOneToOne: false
            referencedRelation: "msa_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sows_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          can_approve: boolean
          client_id: string
          client_role: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          can_approve?: boolean
          client_id: string
          client_role?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          can_approve?: boolean
          client_id?: string
          client_role?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_contact_email: string | null
          billing_contact_name: string | null
          created_at: string
          created_by: string | null
          default_billing_frequency: string
          default_discount_kind: string | null
          default_discount_value: number | null
          id: string
          legal_name: string | null
          msa_document_path: string | null
          msa_signed_on: string | null
          msa_version: string | null
          name: string
          notes: string | null
          payment_terms_days: number
          primary_contact_email: string | null
          primary_contact_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          created_at?: string
          created_by?: string | null
          default_billing_frequency?: string
          default_discount_kind?: string | null
          default_discount_value?: number | null
          id?: string
          legal_name?: string | null
          msa_document_path?: string | null
          msa_signed_on?: string | null
          msa_version?: string | null
          name: string
          notes?: string | null
          payment_terms_days?: number
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          created_at?: string
          created_by?: string | null
          default_billing_frequency?: string
          default_discount_kind?: string | null
          default_discount_value?: number | null
          id?: string
          legal_name?: string | null
          msa_document_path?: string | null
          msa_signed_on?: string | null
          msa_version?: string | null
          name?: string
          notes?: string | null
          payment_terms_days?: number
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      closing_documents: {
        Row: {
          application_id: string
          closing_id: string
          file_name: string
          id: string
          offering_id: string
          size_bytes: number | null
          storage_path: string
          title: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          application_id: string
          closing_id: string
          file_name: string
          id?: string
          offering_id: string
          size_bytes?: number | null
          storage_path: string
          title: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          application_id?: string
          closing_id?: string
          file_name?: string
          id?: string
          offering_id?: string
          size_bytes?: number | null
          storage_path?: string
          title?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_documents_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "application_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_documents_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_holds: {
        Row: {
          cleared_at: string | null
          cleared_by: string | null
          client_explanation: string | null
          client_id: string | null
          created_at: string
          id: string
          internal_note: string | null
          offering_id: string | null
          placed_at: string
          placed_by: string | null
          reason: string
          remediation: string | null
          scope: string
          service_key: string | null
          status: string
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          cleared_at?: string | null
          cleared_by?: string | null
          client_explanation?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          internal_note?: string | null
          offering_id?: string | null
          placed_at?: string
          placed_by?: string | null
          reason: string
          remediation?: string | null
          scope: string
          service_key?: string | null
          status?: string
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          cleared_at?: string | null
          cleared_by?: string | null
          client_explanation?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          internal_note?: string | null
          offering_id?: string | null
          placed_at?: string
          placed_by?: string | null
          reason?: string
          remediation?: string | null
          scope?: string
          service_key?: string | null
          status?: string
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_holds_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_holds_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_submissions: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          application_id: string
          check_kind: string
          created_at: string
          id: string
          note: string | null
          offering_id: string | null
          payload: Json
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string
          application_id: string
          check_kind: string
          created_at?: string
          id?: string
          note?: string | null
          offering_id?: string | null
          payload?: Json
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          application_id?: string
          check_kind?: string
          created_at?: string
          id?: string
          note?: string | null
          offering_id?: string | null
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_submissions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_submissions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          approval: string | null
          area: string
          client_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          new_value: Json | null
          offering_id: string | null
          previous_value: Json | null
          source: string | null
          supporting_document: string | null
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          approval?: string | null
          area: string
          client_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          offering_id?: string | null
          previous_value?: Json | null
          source?: string | null
          supporting_document?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          approval?: string | null
          area?: string
          client_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          offering_id?: string | null
          previous_value?: Json | null
          source?: string | null
          supporting_document?: string | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_audit_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_audit_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_activity_cases: {
        Row: {
          case_type: string
          claim_id: string | null
          claimed_quantity: number | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          id: string
          opened_at: string
          opened_by: string | null
          record_quantity: number | null
          resolution: string | null
          severity: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          case_type?: string
          claim_id?: string | null
          claimed_quantity?: number | null
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          record_quantity?: number | null
          resolution?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          case_type?: string
          claim_id?: string | null
          claimed_quantity?: number | null
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          record_quantity?: number | null
          resolution?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_activity_cases_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "ct_exposure_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_activity_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_case_notes: {
        Row: {
          author_id: string | null
          case_id: string
          company_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          author_id?: string | null
          case_id: string
          company_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          author_id?: string | null
          case_id?: string
          company_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ct_activity_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_case_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_claim_documents: {
        Row: {
          claim_id: string
          company_id: string
          created_at: string
          id: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          claim_id: string
          company_id: string
          created_at?: string
          id?: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          claim_id?: string
          company_id?: string
          created_at?: string
          id?: string
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_claim_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "ct_exposure_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_claim_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_claim_invites: {
        Row: {
          claimant_email: string
          claimant_name: string
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          issuer_id: string | null
          revoked_at: string | null
          token_hash: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          claimant_email: string
          claimant_name: string
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          issuer_id?: string | null
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          claimant_email?: string
          claimant_name?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          issuer_id?: string | null
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_claim_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_claim_invites_issuer_id_fkey"
            columns: ["issuer_id"]
            isOneToOne: false
            referencedRelation: "ct_issuers"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_companies: {
        Row: {
          authorized_shares: number
          client_id: string | null
          created_at: string
          currency: string
          entity_type: string | null
          fiscal_year_end: string | null
          id: string
          incorporation_date: string | null
          is_demo: boolean
          jurisdiction: string | null
          legal_name: string | null
          name: string
          par_value: number | null
          updated_at: string
        }
        Insert: {
          authorized_shares?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          entity_type?: string | null
          fiscal_year_end?: string | null
          id?: string
          incorporation_date?: string | null
          is_demo?: boolean
          jurisdiction?: string | null
          legal_name?: string | null
          name: string
          par_value?: number | null
          updated_at?: string
        }
        Update: {
          authorized_shares?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          entity_type?: string | null
          fiscal_year_end?: string | null
          id?: string
          incorporation_date?: string | null
          is_demo?: boolean
          jurisdiction?: string | null
          legal_name?: string | null
          name?: string
          par_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_companies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_concierge_cases: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          company_id: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          founder_note: string | null
          id: string
          migration_id: string
          prepared_summary: Json | null
          priority: string
          recorded_at: string | null
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          sent_for_review_at: string | null
          stage: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          founder_note?: string | null
          id?: string
          migration_id: string
          prepared_summary?: Json | null
          priority?: string
          recorded_at?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_for_review_at?: string | null
          stage?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          founder_note?: string | null
          id?: string
          migration_id?: string
          prepared_summary?: Json | null
          priority?: string
          recorded_at?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_for_review_at?: string | null
          stage?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_concierge_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_concierge_cases_migration_id_fkey"
            columns: ["migration_id"]
            isOneToOne: true
            referencedRelation: "ct_migrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_concierge_exceptions: {
        Row: {
          case_id: string
          company_id: string
          created_at: string
          detail: string | null
          founder_response: string | null
          id: string
          migration_row_id: string | null
          question: string
          raised_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          case_id: string
          company_id: string
          created_at?: string
          detail?: string | null
          founder_response?: string | null
          id?: string
          migration_row_id?: string | null
          question: string
          raised_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          company_id?: string
          created_at?: string
          detail?: string | null
          founder_response?: string | null
          id?: string
          migration_row_id?: string | null
          question?: string
          raised_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_concierge_exceptions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ct_concierge_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_concierge_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_concierge_exceptions_migration_row_id_fkey"
            columns: ["migration_row_id"]
            isOneToOne: false
            referencedRelation: "ct_migration_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_concierge_notes: {
        Row: {
          author_id: string | null
          body: string
          case_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_concierge_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ct_concierge_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_documents: {
        Row: {
          company_id: string
          created_at: string
          doc_type: string
          id: string
          linked_id: string | null
          linked_type: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          doc_type?: string
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          doc_type?: string
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_events: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          new_state: Json | null
          occurred_at: string
          previous_state: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_state?: Json | null
          occurred_at?: string
          previous_state?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_state?: Json | null
          occurred_at?: string
          previous_state?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_exercise_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          exercise_price: number | null
          id: string
          method: string
          note: string | null
          quantity: number
          requested_by: string | null
          security_id: string
          stakeholder_id: string
          status: string
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          exercise_price?: number | null
          id?: string
          method?: string
          note?: string | null
          quantity: number
          requested_by?: string | null
          security_id: string
          stakeholder_id: string
          status?: string
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          exercise_price?: number | null
          id?: string
          method?: string
          note?: string | null
          quantity?: number
          requested_by?: string | null
          security_id?: string
          stakeholder_id?: string
          status?: string
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_exercise_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_exercise_requests_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_exercise_requests_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_exposure_claims: {
        Row: {
          as_of_date: string | null
          claimant_email: string | null
          claimant_name: string
          claimant_note: string | null
          claimant_stakeholder_id: string | null
          claimant_type: string
          claimant_user_id: string | null
          claimed_quantity: number
          company_id: string
          created_at: string
          holding_route: string
          id: string
          info_request: string | null
          invite_id: string | null
          issuer_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          security_label: string | null
          security_type: string
          status: string
          submitted_at: string
          through_entity: string | null
          updated_at: string
          verified_quantity: number | null
        }
        Insert: {
          as_of_date?: string | null
          claimant_email?: string | null
          claimant_name: string
          claimant_note?: string | null
          claimant_stakeholder_id?: string | null
          claimant_type?: string
          claimant_user_id?: string | null
          claimed_quantity?: number
          company_id: string
          created_at?: string
          holding_route?: string
          id?: string
          info_request?: string | null
          invite_id?: string | null
          issuer_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          security_label?: string | null
          security_type?: string
          status?: string
          submitted_at?: string
          through_entity?: string | null
          updated_at?: string
          verified_quantity?: number | null
        }
        Update: {
          as_of_date?: string | null
          claimant_email?: string | null
          claimant_name?: string
          claimant_note?: string | null
          claimant_stakeholder_id?: string | null
          claimant_type?: string
          claimant_user_id?: string | null
          claimed_quantity?: number
          company_id?: string
          created_at?: string
          holding_route?: string
          id?: string
          info_request?: string | null
          invite_id?: string | null
          issuer_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          security_label?: string | null
          security_type?: string
          status?: string
          submitted_at?: string
          through_entity?: string | null
          updated_at?: string
          verified_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_exposure_claims_claimant_stakeholder_id_fkey"
            columns: ["claimant_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_exposure_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_exposure_claims_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "ct_claim_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_exposure_claims_issuer_id_fkey"
            columns: ["issuer_id"]
            isOneToOne: false
            referencedRelation: "ct_issuers"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_holder_permissions: {
        Row: {
          can_request_exercise: boolean
          can_view_company_summary: boolean
          can_view_documents: boolean
          can_view_holdings: boolean
          can_view_tax_documents: boolean
          can_view_transactions: boolean
          can_view_valuations: boolean
          can_view_vesting: boolean
          company_id: string
          created_at: string
          id: string
          notes: string | null
          stakeholder_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          can_request_exercise?: boolean
          can_view_company_summary?: boolean
          can_view_documents?: boolean
          can_view_holdings?: boolean
          can_view_tax_documents?: boolean
          can_view_transactions?: boolean
          can_view_valuations?: boolean
          can_view_vesting?: boolean
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          stakeholder_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          can_request_exercise?: boolean
          can_view_company_summary?: boolean
          can_view_documents?: boolean
          can_view_holdings?: boolean
          can_view_tax_documents?: boolean
          can_view_transactions?: boolean
          can_view_valuations?: boolean
          can_view_vesting?: boolean
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          stakeholder_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_holder_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_holder_permissions_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: true
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_issuers: {
        Row: {
          company_id: string
          contact_email: string | null
          created_at: string
          created_by: string | null
          id: string
          issuer_type: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issuer_type?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issuer_type?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_issuers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_migration_rows: {
        Row: {
          company_id: string
          created_at: string
          created_security_id: string | null
          id: string
          issues: Json
          mapped: Json
          match_stakeholder_id: string | null
          migration_id: string
          raw: Json
          row_number: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_security_id?: string | null
          id?: string
          issues?: Json
          mapped?: Json
          match_stakeholder_id?: string | null
          migration_id: string
          raw?: Json
          row_number?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_security_id?: string | null
          id?: string
          issues?: Json
          mapped?: Json
          match_stakeholder_id?: string | null
          migration_id?: string
          raw?: Json
          row_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_migration_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_migration_rows_created_security_id_fkey"
            columns: ["created_security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_migration_rows_match_stakeholder_id_fkey"
            columns: ["match_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_migration_rows_migration_id_fkey"
            columns: ["migration_id"]
            isOneToOne: false
            referencedRelation: "ct_migrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_migrations: {
        Row: {
          bundle_id: string | null
          company_id: string
          concierge_note: string | null
          concierge_requested_at: string | null
          created_at: string
          created_by: string | null
          detected_provider: string | null
          file_kind: string
          file_name: string | null
          headers: Json
          id: string
          imported_at: string | null
          imported_by: string | null
          mapping: Json
          notes: string | null
          overage_reason: string | null
          reconciliation: Json | null
          row_count: number
          source_provider: string
          status: string
          updated_at: string
        }
        Insert: {
          bundle_id?: string | null
          company_id: string
          concierge_note?: string | null
          concierge_requested_at?: string | null
          created_at?: string
          created_by?: string | null
          detected_provider?: string | null
          file_kind?: string
          file_name?: string | null
          headers?: Json
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          mapping?: Json
          notes?: string | null
          overage_reason?: string | null
          reconciliation?: Json | null
          row_count?: number
          source_provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          bundle_id?: string | null
          company_id?: string
          concierge_note?: string | null
          concierge_requested_at?: string | null
          created_at?: string
          created_by?: string | null
          detected_provider?: string | null
          file_kind?: string
          file_name?: string | null
          headers?: Json
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          mapping?: Json
          notes?: string | null
          overage_reason?: string | null
          reconciliation?: Json | null
          row_count?: number
          source_provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_migrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_round_investments: {
        Row: {
          amount: number
          class_id: string | null
          closed_at: string | null
          commitment_date: string | null
          company_id: string
          created_at: string
          created_by: string | null
          discount_rate: number | null
          funded_at: string | null
          id: string
          instrument: string
          interest_rate: number | null
          maturity_date: string | null
          notes: string | null
          price_per_share: number | null
          round_id: string | null
          security_id: string | null
          shares: number | null
          signed_at: string | null
          stakeholder_id: string
          status: string
          updated_at: string
          valuation_cap: number | null
        }
        Insert: {
          amount?: number
          class_id?: string | null
          closed_at?: string | null
          commitment_date?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          discount_rate?: number | null
          funded_at?: string | null
          id?: string
          instrument?: string
          interest_rate?: number | null
          maturity_date?: string | null
          notes?: string | null
          price_per_share?: number | null
          round_id?: string | null
          security_id?: string | null
          shares?: number | null
          signed_at?: string | null
          stakeholder_id: string
          status?: string
          updated_at?: string
          valuation_cap?: number | null
        }
        Update: {
          amount?: number
          class_id?: string | null
          closed_at?: string | null
          commitment_date?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          discount_rate?: number | null
          funded_at?: string | null
          id?: string
          instrument?: string
          interest_rate?: number | null
          maturity_date?: string | null
          notes?: string | null
          price_per_share?: number | null
          round_id?: string | null
          security_id?: string | null
          shares?: number | null
          signed_at?: string | null
          stakeholder_id?: string
          status?: string
          updated_at?: string
          valuation_cap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_round_investments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "ct_security_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_round_investments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_round_investments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "ct_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_round_investments_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_round_investments_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_rounds: {
        Row: {
          amount_raised: number | null
          close_date: string | null
          company_id: string
          created_at: string
          id: string
          lead_investor: string | null
          name: string
          notes: string | null
          pre_money: number | null
          price_per_share: number | null
          round_type: string
          status: string
          target_amount: number | null
          updated_at: string
        }
        Insert: {
          amount_raised?: number | null
          close_date?: string | null
          company_id: string
          created_at?: string
          id?: string
          lead_investor?: string | null
          name: string
          notes?: string | null
          pre_money?: number | null
          price_per_share?: number | null
          round_type?: string
          status?: string
          target_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount_raised?: number | null
          close_date?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lead_investor?: string | null
          name?: string
          notes?: string | null
          pre_money?: number | null
          price_per_share?: number | null
          round_type?: string
          status?: string
          target_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_rounds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_secondary_transfers: {
        Row: {
          amount: number | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_security_id: string | null
          buyer_stakeholder_id: string | null
          buyer_type: string | null
          closed_at: string | null
          closing_date: string | null
          company_id: string
          consent_decided_at: string | null
          consent_decided_by: string | null
          consent_note: string | null
          consent_status: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          price_per_share: number | null
          quantity: number
          requested_on: string | null
          restriction_note: string | null
          restriction_reviewed_at: string | null
          restriction_reviewed_by: string | null
          restriction_status: string
          rofr_deadline: string | null
          rofr_decided_at: string | null
          rofr_decided_by: string | null
          rofr_note: string | null
          rofr_status: string
          security_id: string | null
          seller_stakeholder_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_security_id?: string | null
          buyer_stakeholder_id?: string | null
          buyer_type?: string | null
          closed_at?: string | null
          closing_date?: string | null
          company_id: string
          consent_decided_at?: string | null
          consent_decided_by?: string | null
          consent_note?: string | null
          consent_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          price_per_share?: number | null
          quantity?: number
          requested_on?: string | null
          restriction_note?: string | null
          restriction_reviewed_at?: string | null
          restriction_reviewed_by?: string | null
          restriction_status?: string
          rofr_deadline?: string | null
          rofr_decided_at?: string | null
          rofr_decided_by?: string | null
          rofr_note?: string | null
          rofr_status?: string
          security_id?: string | null
          seller_stakeholder_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_security_id?: string | null
          buyer_stakeholder_id?: string | null
          buyer_type?: string | null
          closed_at?: string | null
          closing_date?: string | null
          company_id?: string
          consent_decided_at?: string | null
          consent_decided_by?: string | null
          consent_note?: string | null
          consent_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          price_per_share?: number | null
          quantity?: number
          requested_on?: string | null
          restriction_note?: string | null
          restriction_reviewed_at?: string | null
          restriction_reviewed_by?: string | null
          restriction_status?: string
          rofr_deadline?: string | null
          rofr_decided_at?: string | null
          rofr_decided_by?: string | null
          rofr_note?: string | null
          rofr_status?: string
          security_id?: string | null
          seller_stakeholder_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_secondary_transfers_buyer_security_id_fkey"
            columns: ["buyer_security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_secondary_transfers_buyer_stakeholder_id_fkey"
            columns: ["buyer_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_secondary_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_secondary_transfers_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_secondary_transfers_seller_stakeholder_id_fkey"
            columns: ["seller_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_securities: {
        Row: {
          acceptance_name: string | null
          accepted_at: string | null
          accepted_by: string | null
          class_id: string | null
          company_id: string
          created_at: string
          discount_rate: number | null
          exercise_price: number | null
          id: string
          issue_date: string | null
          label: string | null
          notes: string | null
          principal: number | null
          purchase_price: number | null
          quantity: number
          round_id: string | null
          security_type: string
          stakeholder_id: string
          status: string
          transfer_restrictions: string | null
          updated_at: string
          valuation_cap: number | null
          verification_status: string
          vesting_schedule_id: string | null
        }
        Insert: {
          acceptance_name?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          class_id?: string | null
          company_id: string
          created_at?: string
          discount_rate?: number | null
          exercise_price?: number | null
          id?: string
          issue_date?: string | null
          label?: string | null
          notes?: string | null
          principal?: number | null
          purchase_price?: number | null
          quantity?: number
          round_id?: string | null
          security_type?: string
          stakeholder_id: string
          status?: string
          transfer_restrictions?: string | null
          updated_at?: string
          valuation_cap?: number | null
          verification_status?: string
          vesting_schedule_id?: string | null
        }
        Update: {
          acceptance_name?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          class_id?: string | null
          company_id?: string
          created_at?: string
          discount_rate?: number | null
          exercise_price?: number | null
          id?: string
          issue_date?: string | null
          label?: string | null
          notes?: string | null
          principal?: number | null
          purchase_price?: number | null
          quantity?: number
          round_id?: string | null
          security_type?: string
          stakeholder_id?: string
          status?: string
          transfer_restrictions?: string | null
          updated_at?: string
          valuation_cap?: number | null
          verification_status?: string
          vesting_schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_securities_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "ct_security_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_securities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_securities_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "ct_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_securities_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_securities_vesting_schedule_id_fkey"
            columns: ["vesting_schedule_id"]
            isOneToOne: false
            referencedRelation: "ct_vesting_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_security_classes: {
        Row: {
          authorized: number | null
          company_id: string
          conversion_ratio: number
          created_at: string
          id: string
          kind: string
          liquidation_preference: number | null
          name: string
          notes: string | null
          price_per_share: number | null
          seniority: number
          updated_at: string
        }
        Insert: {
          authorized?: number | null
          company_id: string
          conversion_ratio?: number
          created_at?: string
          id?: string
          kind?: string
          liquidation_preference?: number | null
          name: string
          notes?: string | null
          price_per_share?: number | null
          seniority?: number
          updated_at?: string
        }
        Update: {
          authorized?: number | null
          company_id?: string
          conversion_ratio?: number
          created_at?: string
          id?: string
          kind?: string
          liquidation_preference?: number | null
          name?: string
          notes?: string | null
          price_per_share?: number | null
          seniority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_security_classes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_stakeholders: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          entity_name: string | null
          id: string
          name: string
          notes: string | null
          stakeholder_type: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          entity_name?: string | null
          id?: string
          name: string
          notes?: string | null
          stakeholder_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          entity_name?: string | null
          id?: string
          name?: string
          notes?: string | null
          stakeholder_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_stakeholders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_transactions: {
        Row: {
          amount: number | null
          company_id: string
          counterparty_stakeholder_id: string | null
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          kind: string
          metadata: Json
          quantity: number
          reason: string | null
          round_id: string | null
          security_id: string | null
          stakeholder_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          company_id: string
          counterparty_stakeholder_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          kind: string
          metadata?: Json
          quantity?: number
          reason?: string | null
          round_id?: string | null
          security_id?: string | null
          stakeholder_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          company_id?: string
          counterparty_stakeholder_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          kind?: string
          metadata?: Json
          quantity?: number
          reason?: string | null
          round_id?: string | null
          security_id?: string | null
          stakeholder_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_transactions_counterparty_stakeholder_id_fkey"
            columns: ["counterparty_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_transactions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "ct_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_transactions_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_transactions_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_vesting_schedules: {
        Row: {
          cliff_months: number
          company_id: string
          created_at: string
          duration_months: number
          frequency: string
          id: string
          name: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          cliff_months?: number
          company_id: string
          created_at?: string
          duration_months?: number
          frequency?: string
          id?: string
          name: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          cliff_months?: number
          company_id?: string
          created_at?: string
          duration_months?: number
          frequency?: string
          id?: string
          name?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_vesting_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          authority_level:
            | Database["public"]["Enums"]["delegation_authority_level"]
            | null
          before_state: Json | null
          capabilities: string[]
          created_at: string
          delegate_user_id: string | null
          delegation_id: string | null
          detail: string | null
          id: string
          membership_id: string | null
          organization_id: string | null
          outcome: string
          principal_user_id: string | null
          scope_id: string | null
          scope_type:
            | Database["public"]["Enums"]["delegation_scope_type"]
            | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          authority_level?:
            | Database["public"]["Enums"]["delegation_authority_level"]
            | null
          before_state?: Json | null
          capabilities?: string[]
          created_at?: string
          delegate_user_id?: string | null
          delegation_id?: string | null
          detail?: string | null
          id?: string
          membership_id?: string | null
          organization_id?: string | null
          outcome?: string
          principal_user_id?: string | null
          scope_id?: string | null
          scope_type?:
            | Database["public"]["Enums"]["delegation_scope_type"]
            | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          authority_level?:
            | Database["public"]["Enums"]["delegation_authority_level"]
            | null
          before_state?: Json | null
          capabilities?: string[]
          created_at?: string
          delegate_user_id?: string | null
          delegation_id?: string | null
          detail?: string | null
          id?: string
          membership_id?: string | null
          organization_id?: string | null
          outcome?: string
          principal_user_id?: string | null
          scope_id?: string | null
          scope_type?:
            | Database["public"]["Enums"]["delegation_scope_type"]
            | null
        }
        Relationships: []
      }
      delegation_permissions: {
        Row: {
          capability: Database["public"]["Enums"]["delegation_capability"]
          delegation_id: string
          granted_at: string
          granted_by: string | null
          id: string
        }
        Insert: {
          capability: Database["public"]["Enums"]["delegation_capability"]
          delegation_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
        }
        Update: {
          capability?: Database["public"]["Enums"]["delegation_capability"]
          delegation_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_permissions_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations: {
        Row: {
          authority_document_name: string | null
          authority_document_path: string | null
          authority_level: Database["public"]["Enums"]["delegation_authority_level"]
          created_at: string
          data_category: string | null
          delegate_user_id: string
          effective_at: string
          expires_at: string | null
          granted_by: string
          id: string
          last_used_at: string | null
          organization_id: string | null
          principal_user_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["delegation_scope_type"]
          status: Database["public"]["Enums"]["delegation_status"]
          updated_at: string
        }
        Insert: {
          authority_document_name?: string | null
          authority_document_path?: string | null
          authority_level?: Database["public"]["Enums"]["delegation_authority_level"]
          created_at?: string
          data_category?: string | null
          delegate_user_id: string
          effective_at?: string
          expires_at?: string | null
          granted_by: string
          id?: string
          last_used_at?: string | null
          organization_id?: string | null
          principal_user_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string | null
          scope_type: Database["public"]["Enums"]["delegation_scope_type"]
          status?: Database["public"]["Enums"]["delegation_status"]
          updated_at?: string
        }
        Update: {
          authority_document_name?: string | null
          authority_document_path?: string | null
          authority_level?: Database["public"]["Enums"]["delegation_authority_level"]
          created_at?: string
          data_category?: string | null
          delegate_user_id?: string
          effective_at?: string
          expires_at?: string | null
          granted_by?: string
          id?: string
          last_used_at?: string | null
          organization_id?: string | null
          principal_user_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["delegation_scope_type"]
          status?: Database["public"]["Enums"]["delegation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
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
      diligence_document_access: {
        Row: {
          created_at: string
          document_id: string
          granted_by: string
          id: string
          investor_user_id: string
          offering_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          granted_by: string
          id?: string
          investor_user_id: string
          offering_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          granted_by?: string
          id?: string
          investor_user_id?: string
          offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_document_access_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "diligence_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_document_access_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
          visibility: string
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
          visibility?: string
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
          visibility?: string
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
      diligence_investor_permissions: {
        Row: {
          cap_table_visible: boolean
          created_at: string
          id: string
          investor_user_id: string
          note: string | null
          offering_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          cap_table_visible?: boolean
          created_at?: string
          id?: string
          investor_user_id: string
          note?: string | null
          offering_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          cap_table_visible?: boolean
          created_at?: string
          id?: string
          investor_user_id?: string
          note?: string | null
          offering_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_investor_permissions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
      diligence_nda_signatures: {
        Row: {
          completed_at: string | null
          created_at: string
          document_hash: string | null
          id: string
          manager_notified_at: string | null
          nda_version: number
          offering_id: string
          room_id: string
          sent_at: string | null
          sign_request_id: string | null
          signed_box_file_id: string | null
          signed_file_name: string | null
          signed_pdf_path: string | null
          signer_email: string
          signer_name: string
          signing_url: string | null
          source_box_file_id: string | null
          status: string
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_hash?: string | null
          id?: string
          manager_notified_at?: string | null
          nda_version?: number
          offering_id: string
          room_id: string
          sent_at?: string | null
          sign_request_id?: string | null
          signed_box_file_id?: string | null
          signed_file_name?: string | null
          signed_pdf_path?: string | null
          signer_email: string
          signer_name: string
          signing_url?: string | null
          source_box_file_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_hash?: string | null
          id?: string
          manager_notified_at?: string | null
          nda_version?: number
          offering_id?: string
          room_id?: string
          sent_at?: string | null
          sign_request_id?: string | null
          signed_box_file_id?: string | null
          signed_file_name?: string | null
          signed_pdf_path?: string | null
          signer_email?: string
          signer_name?: string
          signing_url?: string | null
          source_box_file_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diligence_nda_signatures_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_nda_signatures_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diligence_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_question_assignments: {
        Row: {
          answered_at: string | null
          assigned_by: string
          created_at: string
          due_date: string | null
          id: string
          investor_user_id: string
          offering_id: string
          question_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          assigned_by: string
          created_at?: string
          due_date?: string | null
          id?: string
          investor_user_id: string
          offering_id: string
          question_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          assigned_by?: string
          created_at?: string
          due_date?: string | null
          id?: string
          investor_user_id?: string
          offering_id?: string
          question_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_question_assignments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_question_assignments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "diligence_request_questions"
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
      diligence_question_responses: {
        Row: {
          assignment_id: string
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
          assignment_id: string
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
          assignment_id?: string
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
            foreignKeyName: "diligence_question_responses_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "diligence_question_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_question_responses_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_question_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "diligence_request_questions"
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
      diligence_request_questions: {
        Row: {
          category: string
          created_at: string
          created_by: string
          guidance: string | null
          id: string
          is_required: boolean
          offering_id: string
          prompt: string
          room_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          guidance?: string | null
          id?: string
          is_required?: boolean
          offering_id: string
          prompt: string
          room_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          guidance?: string | null
          id?: string
          is_required?: boolean
          offering_id?: string
          prompt?: string
          room_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_request_questions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_request_questions_room_id_fkey"
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
          nda_box_file_id: string | null
          nda_file_name: string | null
          nda_required: boolean
          nda_signing_enabled: boolean
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
          nda_box_file_id?: string | null
          nda_file_name?: string | null
          nda_required?: boolean
          nda_signing_enabled?: boolean
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
          nda_box_file_id?: string | null
          nda_file_name?: string | null
          nda_required?: boolean
          nda_signing_enabled?: boolean
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
          provider_sent_at: string | null
          provider_signing_url: string | null
          provider_source_file_id: string | null
          provider_status: string | null
          provider_viewed_at: string | null
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
          provider_sent_at?: string | null
          provider_signing_url?: string | null
          provider_source_file_id?: string | null
          provider_status?: string | null
          provider_viewed_at?: string | null
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
          provider_sent_at?: string | null
          provider_signing_url?: string | null
          provider_source_file_id?: string | null
          provider_status?: string | null
          provider_viewed_at?: string | null
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
      eligibility_rules: {
        Row: {
          active: boolean
          applies_to: string
          blocking: boolean
          created_at: string
          default_value: Json
          description: string | null
          id: string
          key: string
          label: string
          rule_type: string
          sort_order: number
          source_reference: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: string
          blocking?: boolean
          created_at?: string
          default_value?: Json
          description?: string | null
          id?: string
          key: string
          label: string
          rule_type?: string
          sort_order?: number
          source_reference?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: string
          blocking?: boolean
          created_at?: string
          default_value?: Json
          description?: string | null
          id?: string
          key?: string
          label?: string
          rule_type?: string
          sort_order?: number
          source_reference?: string | null
          updated_at?: string
        }
        Relationships: []
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
      email_opens: {
        Row: {
          application_id: string | null
          id: string
          investor_email_id: string | null
          opened_at: string
          recipient: string
          template: string | null
          user_agent: string | null
        }
        Insert: {
          application_id?: string | null
          id?: string
          investor_email_id?: string | null
          opened_at?: string
          recipient: string
          template?: string | null
          user_agent?: string | null
        }
        Update: {
          application_id?: string | null
          id?: string
          investor_email_id?: string | null
          opened_at?: string
          recipient?: string
          template?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_opens_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_opens_investor_email_id_fkey"
            columns: ["investor_email_id"]
            isOneToOne: false
            referencedRelation: "investor_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_change_orders: {
        Row: {
          change_no: number
          change_type: string
          client_id: string
          client_reason: string | null
          client_signed_at: string | null
          client_signed_by: string | null
          client_signer_name: string | null
          client_signer_title: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          document_type: string
          effective_date: string | null
          engagement_id: string
          executed_at: string | null
          harmonious_signed_at: string | null
          harmonious_signer_name: string | null
          harmonious_signer_title: string | null
          id: string
          requested_by: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          change_no?: number
          change_type?: string
          client_id: string
          client_reason?: string | null
          client_signed_at?: string | null
          client_signed_by?: string | null
          client_signer_name?: string | null
          client_signer_title?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          document_type?: string
          effective_date?: string | null
          engagement_id: string
          executed_at?: string | null
          harmonious_signed_at?: string | null
          harmonious_signer_name?: string | null
          harmonious_signer_title?: string | null
          id?: string
          requested_by?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          change_no?: number
          change_type?: string
          client_id?: string
          client_reason?: string | null
          client_signed_at?: string | null
          client_signed_by?: string | null
          client_signer_name?: string | null
          client_signer_title?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          document_type?: string
          effective_date?: string | null
          engagement_id?: string
          executed_at?: string | null
          harmonious_signed_at?: string | null
          harmonious_signer_name?: string | null
          harmonious_signer_title?: string | null
          id?: string
          requested_by?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_change_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_change_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_entities: {
        Row: {
          created_at: string
          engagement_id: string
          entity_id: string
          id: string
        }
        Insert: {
          created_at?: string
          engagement_id: string
          entity_id: string
          id?: string
        }
        Update: {
          created_at?: string
          engagement_id?: string
          entity_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_entities_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_services: {
        Row: {
          added_by_change_order_id: string | null
          agreed_price_cents: number
          billing_frequency: string
          category: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deliverables: string[]
          discount_cents: number
          discount_reason: string | null
          effective_date: string | null
          end_date: string | null
          engagement_id: string
          exclusions: string[]
          id: string
          locked_at: string | null
          pass_through: boolean
          pricing_model: string
          pricing_version_id: string | null
          pricing_version_label: string | null
          removed_by_change_order_id: string | null
          renewal_rule: string | null
          scope: string | null
          service_id: string | null
          service_key: string
          service_name: string
          standard_price_cents: number
          status: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          added_by_change_order_id?: string | null
          agreed_price_cents?: number
          billing_frequency?: string
          category?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deliverables?: string[]
          discount_cents?: number
          discount_reason?: string | null
          effective_date?: string | null
          end_date?: string | null
          engagement_id: string
          exclusions?: string[]
          id?: string
          locked_at?: string | null
          pass_through?: boolean
          pricing_model?: string
          pricing_version_id?: string | null
          pricing_version_label?: string | null
          removed_by_change_order_id?: string | null
          renewal_rule?: string | null
          scope?: string | null
          service_id?: string | null
          service_key: string
          service_name: string
          standard_price_cents?: number
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          added_by_change_order_id?: string | null
          agreed_price_cents?: number
          billing_frequency?: string
          category?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deliverables?: string[]
          discount_cents?: number
          discount_reason?: string | null
          effective_date?: string | null
          end_date?: string | null
          engagement_id?: string
          exclusions?: string[]
          id?: string
          locked_at?: string | null
          pass_through?: boolean
          pricing_model?: string
          pricing_version_id?: string | null
          pricing_version_label?: string | null
          removed_by_change_order_id?: string | null
          renewal_rule?: string | null
          scope?: string | null
          service_id?: string | null
          service_key?: string
          service_name?: string
          standard_price_cents?: number
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_services_added_by_change_order_id_fkey"
            columns: ["added_by_change_order_id"]
            isOneToOne: false
            referencedRelation: "engagement_change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_services_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_services_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "pricing_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_services_removed_by_change_order_id_fkey"
            columns: ["removed_by_change_order_id"]
            isOneToOne: false
            referencedRelation: "engagement_change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_workflows: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          engagement_id: string
          engagement_service_id: string | null
          entity_id: string | null
          id: string
          notes: string | null
          owner_user_id: string | null
          started_at: string | null
          status: string
          target_path: string | null
          updated_at: string
          workflow_key: string
          workflow_name: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          engagement_id: string
          engagement_service_id?: string | null
          entity_id?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          started_at?: string | null
          status?: string
          target_path?: string | null
          updated_at?: string
          workflow_key: string
          workflow_name: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          engagement_id?: string
          engagement_service_id?: string | null
          entity_id?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          started_at?: string | null
          status?: string
          target_path?: string | null
          updated_at?: string
          workflow_key?: string
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_workflows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_workflows_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "client_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_workflows_engagement_service_id_fkey"
            columns: ["engagement_service_id"]
            isOneToOne: false
            referencedRelation: "engagement_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_workflows_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_access_requests: {
        Row: {
          created_at: string
          email: string
          firm: string
          full_name: string
          handled_at: string | null
          handled_by: string | null
          id: string
          internal_note: string
          ip_address: string | null
          message: string
          offering_id: string
          phone: string
          source: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          firm?: string
          full_name: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          internal_note?: string
          ip_address?: string | null
          message?: string
          offering_id: string
          phone?: string
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          firm?: string
          full_name?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          internal_note?: string
          ip_address?: string | null
          message?: string
          offering_id?: string
          phone?: string
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_access_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_compliance_items: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          due_date: string | null
          filed_on: string | null
          id: string
          key: string | null
          label: string
          note: string | null
          offering_id: string
          owner_name: string | null
          reference: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          filed_on?: string | null
          id?: string
          key?: string | null
          label: string
          note?: string | null
          offering_id: string
          owner_name?: string | null
          reference?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          filed_on?: string | null
          id?: string
          key?: string | null
          label?: string
          note?: string | null
          offering_id?: string
          owner_name?: string | null
          reference?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_compliance_items_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_condition_clearances: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          offering_id: string
          reason: string | null
          rule_key: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          offering_id: string
          reason?: string | null
          rule_key: string
          snapshot?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          offering_id?: string
          reason?: string | null
          rule_key?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fund_condition_clearances_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_distributions: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string
          offering_id: string
          paid_on: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string
          offering_id: string
          paid_on: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string
          offering_id?: string
          paid_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_distributions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
          invite_role: Database["public"]["Enums"]["invitation_role"]
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
          invite_role?: Database["public"]["Enums"]["invitation_role"]
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
          invite_role?: Database["public"]["Enums"]["invitation_role"]
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
      fund_migration_rows: {
        Row: {
          accreditation_status: string | null
          application_id: string | null
          closing_date: string | null
          commitment_cents: number
          created_at: string
          email: string
          error_text: string | null
          full_name: string
          funded_cents: number
          id: string
          imported_at: string | null
          investor_type: string | null
          migration_id: string
          note: string | null
          offering_id: string
          row_status: string
          units: number | null
          updated_at: string
        }
        Insert: {
          accreditation_status?: string | null
          application_id?: string | null
          closing_date?: string | null
          commitment_cents?: number
          created_at?: string
          email?: string
          error_text?: string | null
          full_name?: string
          funded_cents?: number
          id?: string
          imported_at?: string | null
          investor_type?: string | null
          migration_id: string
          note?: string | null
          offering_id: string
          row_status?: string
          units?: number | null
          updated_at?: string
        }
        Update: {
          accreditation_status?: string | null
          application_id?: string | null
          closing_date?: string | null
          commitment_cents?: number
          created_at?: string
          email?: string
          error_text?: string | null
          full_name?: string
          funded_cents?: number
          id?: string
          imported_at?: string | null
          investor_type?: string | null
          migration_id?: string
          note?: string | null
          offering_id?: string
          row_status?: string
          units?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_migration_rows_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_migration_rows_migration_id_fkey"
            columns: ["migration_id"]
            isOneToOne: false
            referencedRelation: "fund_migrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_migration_rows_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_migrations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          offering_id: string
          prior_administrator: string | null
          records_as_of: string | null
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          offering_id: string
          prior_administrator?: string | null
          records_as_of?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          offering_id?: string
          prior_administrator?: string | null
          records_as_of?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_migrations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_requests: {
        Row: {
          client_id: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          expected_investments: string | null
          expected_investors: number | null
          expected_launch_date: string | null
          fund_name: string
          fund_type: string | null
          id: string
          jurisdiction: string | null
          notes: string | null
          offering_id: string | null
          services: string[]
          sow_id: string | null
          status: string
          target_raise_cents: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expected_investments?: string | null
          expected_investors?: number | null
          expected_launch_date?: string | null
          fund_name: string
          fund_type?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          offering_id?: string | null
          services?: string[]
          sow_id?: string | null
          status?: string
          target_raise_cents?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expected_investments?: string | null
          expected_investors?: number | null
          expected_launch_date?: string | null
          fund_name?: string
          fund_type?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          offering_id?: string | null
          services?: string[]
          sow_id?: string | null
          status?: string
          target_raise_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_requests_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_requests_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_tax_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          id: string
          investor_user_id: string | null
          note: string | null
          offering_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          tax_year: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name: string
          id?: string
          investor_user_id?: string | null
          note?: string | null
          offering_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          tax_year?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          id?: string
          investor_user_id?: string | null
          note?: string | null
          offering_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          tax_year?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_tax_documents_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_valuations: {
        Row: {
          as_of_date: string
          created_at: string
          created_by: string | null
          id: string
          nav_cents: number
          note: string
          offering_id: string
          updated_at: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          nav_cents?: number
          note?: string
          offering_id: string
          updated_at?: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nav_cents?: number
          note?: string
          offering_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_valuations_offering_id_fkey"
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
          manager_review_notes: string | null
          manager_review_status: string
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          offering_id: string
          persona_id: string | null
          source: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          welcome_email_sent_at: string | null
          wire_fee_cents: number | null
          wire_fee_note: string | null
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
          manager_review_notes?: string | null
          manager_review_status?: string
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          offering_id: string
          persona_id?: string | null
          source?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          welcome_email_sent_at?: string | null
          wire_fee_cents?: number | null
          wire_fee_note?: string | null
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
          manager_review_notes?: string | null
          manager_review_status?: string
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          offering_id?: string
          persona_id?: string | null
          source?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          welcome_email_sent_at?: string | null
          wire_fee_cents?: number | null
          wire_fee_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_applications_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_applications_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "investor_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_cap_positions: {
        Row: {
          application_id: string
          created_at: string
          id: string
          notes: string | null
          notified_at: string | null
          notified_committed_cents: number | null
          notified_ownership_pct: number | null
          notified_received_cents: number | null
          offering_id: string
          ownership_pct_override: number | null
          share_class: string
          shares: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          notified_committed_cents?: number | null
          notified_ownership_pct?: number | null
          notified_received_cents?: number | null
          offering_id: string
          ownership_pct_override?: number | null
          share_class?: string
          shares?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          notified_committed_cents?: number | null
          notified_ownership_pct?: number | null
          notified_received_cents?: number | null
          offering_id?: string
          ownership_pct_override?: number | null
          share_class?: string
          shares?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_cap_positions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_cap_positions_offering_id_fkey"
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
          box_error: string | null
          box_file_id: string | null
          box_folder_id: string | null
          box_uploaded_at: string | null
          doc_kind: string
          file_name: string
          id: string
          note: string | null
          offering_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          box_error?: string | null
          box_file_id?: string | null
          box_folder_id?: string | null
          box_uploaded_at?: string | null
          doc_kind: string
          file_name: string
          id?: string
          note?: string | null
          offering_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          box_error?: string | null
          box_file_id?: string | null
          box_folder_id?: string | null
          box_uploaded_at?: string | null
          doc_kind?: string
          file_name?: string
          id?: string
          note?: string | null
          offering_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
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
      investor_personas: {
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
          is_default: boolean
          kind: Database["public"]["Enums"]["investor_type"]
          label: string
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
          is_default?: boolean
          kind?: Database["public"]["Enums"]["investor_type"]
          label: string
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
          is_default?: boolean
          kind?: Database["public"]["Enums"]["investor_type"]
          label?: string
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
      investor_signoffs: {
        Row: {
          acknowledgements: Json
          application_id: string
          commitment_cents: number
          created_at: string
          fund_name: string
          id: string
          ip_address: string | null
          offering_id: string
          share_price_cents: number | null
          signed_at: string
          signer_name: string
          signer_title: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          version: number
        }
        Insert: {
          acknowledgements?: Json
          application_id: string
          commitment_cents: number
          created_at?: string
          fund_name: string
          id?: string
          ip_address?: string | null
          offering_id: string
          share_price_cents?: number | null
          signed_at?: string
          signer_name: string
          signer_title?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          version?: number
        }
        Update: {
          acknowledgements?: Json
          application_id?: string
          commitment_cents?: number
          created_at?: string
          fund_name?: string
          id?: string
          ip_address?: string | null
          offering_id?: string
          share_price_cents?: number | null
          signed_at?: string
          signer_name?: string
          signer_title?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_signoffs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_signoffs_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          expense_id: string | null
          id: string
          invoice_id: string
          label: string
          offering_id: string | null
          pricing_id: string | null
          quantity: number
          service_key: string | null
          sort_order: number
          source: string
          source_ref: string | null
          unit_cents: number
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          invoice_id: string
          label: string
          offering_id?: string | null
          pricing_id?: string | null
          quantity?: number
          service_key?: string | null
          sort_order?: number
          source?: string
          source_ref?: string | null
          unit_cents?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          invoice_id?: string
          label?: string
          offering_id?: string | null
          pricing_id?: string | null
          quantity?: number
          service_key?: string | null
          sort_order?: number
          source?: string
          source_ref?: string | null
          unit_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "pass_through_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "client_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          approval_requested_at: string | null
          approval_status: string
          client_approved_at: string | null
          client_approved_by: string | null
          client_id: string
          client_paid_on: string | null
          client_payment_declared_at: string | null
          client_payment_declared_by: string | null
          client_payment_method: string | null
          client_payment_note: string | null
          client_payment_reference: string | null
          client_signer_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolution_note: string | null
          dispute_resolved_at: string | null
          dispute_resolved_by: string | null
          due_date: string | null
          id: string
          issue_date: string | null
          issued_at: string | null
          issued_by: string | null
          net_days: number
          note: string | null
          number: string | null
          offering_id: string | null
          paid_on: string | null
          payment_instruction_id: string | null
          payment_reference: string | null
          period_end: string | null
          period_start: string | null
          rate_check: Json | null
          rate_override_reason: string | null
          rate_variance_cents: number
          sow_id: string | null
          status: string
          total_cents: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          approval_requested_at?: string | null
          approval_status?: string
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id: string
          client_paid_on?: string | null
          client_payment_declared_at?: string | null
          client_payment_declared_by?: string | null
          client_payment_method?: string | null
          client_payment_note?: string | null
          client_payment_reference?: string | null
          client_signer_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolution_note?: string | null
          dispute_resolved_at?: string | null
          dispute_resolved_by?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          issued_at?: string | null
          issued_by?: string | null
          net_days?: number
          note?: string | null
          number?: string | null
          offering_id?: string | null
          paid_on?: string | null
          payment_instruction_id?: string | null
          payment_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          rate_check?: Json | null
          rate_override_reason?: string | null
          rate_variance_cents?: number
          sow_id?: string | null
          status?: string
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          approval_requested_at?: string | null
          approval_status?: string
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id?: string
          client_paid_on?: string | null
          client_payment_declared_at?: string | null
          client_payment_declared_by?: string | null
          client_payment_method?: string | null
          client_payment_note?: string | null
          client_payment_reference?: string | null
          client_signer_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolution_note?: string | null
          dispute_resolved_at?: string | null
          dispute_resolved_by?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          issued_at?: string | null
          issued_by?: string | null
          net_days?: number
          note?: string | null
          number?: string | null
          offering_id?: string | null
          paid_on?: string | null
          payment_instruction_id?: string | null
          payment_reference?: string | null
          period_end?: string | null
          period_start?: string | null
          rate_check?: Json | null
          rate_override_reason?: string | null
          rate_variance_cents?: number
          sow_id?: string | null
          status?: string
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_instruction_id_fkey"
            columns: ["payment_instruction_id"]
            isOneToOne: false
            referencedRelation: "payment_instructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
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
          box_error: string | null
          box_file_id: string | null
          box_folder_id: string | null
          box_uploaded_at: string | null
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
          box_error?: string | null
          box_file_id?: string | null
          box_folder_id?: string | null
          box_uploaded_at?: string | null
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
          box_error?: string | null
          box_file_id?: string | null
          box_folder_id?: string | null
          box_uploaded_at?: string | null
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
      marketing_releases: {
        Row: {
          authorized_on: string | null
          authorized_use: string | null
          case_study_permitted: boolean
          client_id: string
          created_at: string
          created_by: string | null
          document_path: string | null
          expires_on: string | null
          id: string
          logo_permitted: boolean
          name_permitted: boolean
          testimonial_permitted: boolean
          updated_at: string
        }
        Insert: {
          authorized_on?: string | null
          authorized_use?: string | null
          case_study_permitted?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          expires_on?: string | null
          id?: string
          logo_permitted?: boolean
          name_permitted?: boolean
          testimonial_permitted?: boolean
          updated_at?: string
        }
        Update: {
          authorized_on?: string | null
          authorized_use?: string | null
          case_study_permitted?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          expires_on?: string | null
          id?: string
          logo_permitted?: boolean
          name_permitted?: boolean
          testimonial_permitted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_releases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      msa_sections: {
        Row: {
          body: string
          created_at: string
          id: string
          msa_version_id: string
          section_no: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          msa_version_id: string
          section_no: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          msa_version_id?: string
          section_no?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "msa_sections_msa_version_id_fkey"
            columns: ["msa_version_id"]
            isOneToOne: false
            referencedRelation: "msa_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      msa_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          status: string
          summary: string | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          status?: string
          summary?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          status?: string
          summary?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
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
      offboarding_cases: {
        Row: {
          client_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          effective_end_date: string | null
          id: string
          initiated_by: string
          note: string | null
          notice_days: number
          notice_received_on: string | null
          sow_id: string | null
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_end_date?: string | null
          id?: string
          initiated_by?: string
          note?: string | null
          notice_days?: number
          notice_received_on?: string | null
          sow_id?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_end_date?: string | null
          id?: string
          initiated_by?: string
          note?: string | null
          notice_days?: number
          notice_received_on?: string | null
          sow_id?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_cases_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
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
      offering_bank_setup_requests: {
        Row: {
          bank: string
          created_at: string
          id: string
          note: string | null
          notified_at: string | null
          offering_id: string
          requested_by: string | null
          requested_by_email: string | null
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bank: string
          created_at?: string
          id?: string
          note?: string | null
          notified_at?: string | null
          offering_id: string
          requested_by?: string | null
          requested_by_email?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bank?: string
          created_at?: string
          id?: string
          note?: string | null
          notified_at?: string | null
          offering_id?: string
          requested_by?: string | null
          requested_by_email?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_bank_setup_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_document_signature_blocks: {
        Row: {
          block_type: string
          created_at: string
          created_by: string | null
          height: number
          id: string
          offering_document_id: string
          page_number: number
          required: boolean
          signer_role: string
          sort_order: number
          updated_at: string
          width: number
          x: number
          y: number
        }
        Insert: {
          block_type: string
          created_at?: string
          created_by?: string | null
          height?: number
          id?: string
          offering_document_id: string
          page_number?: number
          required?: boolean
          signer_role?: string
          sort_order?: number
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Update: {
          block_type?: string
          created_at?: string
          created_by?: string | null
          height?: number
          id?: string
          offering_document_id?: string
          page_number?: number
          required?: boolean
          signer_role?: string
          sort_order?: number
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "offering_document_signature_blocks_offering_document_id_fkey"
            columns: ["offering_document_id"]
            isOneToOne: false
            referencedRelation: "offering_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_document_versions: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          note: string | null
          offering_document_id: string
          offering_id: string
          source: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          note?: string | null
          offering_document_id: string
          offering_id: string
          source?: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          note?: string | null
          offering_document_id?: string
          offering_id?: string
          source?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offering_document_versions_offering_document_id_fkey"
            columns: ["offering_document_id"]
            isOneToOne: false
            referencedRelation: "offering_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_document_versions_offering_id_fkey"
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
          current_version: number
          doc_type: string
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
          file_updated_at: string | null
          id: string
          offering_id: string
          requires_signature: boolean
          sort_order: number
          template_key: string | null
          template_pack: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          current_version?: number
          doc_type: string
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          file_updated_at?: string | null
          id?: string
          offering_id: string
          requires_signature?: boolean
          sort_order?: number
          template_key?: string | null
          template_pack?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          current_version?: number
          doc_type?: string
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          file_updated_at?: string | null
          id?: string
          offering_id?: string
          requires_signature?: boolean
          sort_order?: number
          template_key?: string | null
          template_pack?: string | null
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
      offering_memos: {
        Row: {
          created_at: string
          headline: string
          id: string
          is_published: boolean
          offering_id: string
          opportunity: string
          overview: string
          published_at: string | null
          risks: string
          strategy: string
          team: string
          terms: string
          updated_at: string
          updated_by: string | null
          use_of_proceeds: string
        }
        Insert: {
          created_at?: string
          headline?: string
          id?: string
          is_published?: boolean
          offering_id: string
          opportunity?: string
          overview?: string
          published_at?: string | null
          risks?: string
          strategy?: string
          team?: string
          terms?: string
          updated_at?: string
          updated_by?: string | null
          use_of_proceeds?: string
        }
        Update: {
          created_at?: string
          headline?: string
          id?: string
          is_published?: boolean
          offering_id?: string
          opportunity?: string
          overview?: string
          published_at?: string | null
          risks?: string
          strategy?: string
          team?: string
          terms?: string
          updated_at?: string
          updated_by?: string | null
          use_of_proceeds?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_memos_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
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
      offering_statements: {
        Row: {
          capital_call_terms: string
          carried_interest_bps: number | null
          created_at: string
          distribution_policy: string
          fees_and_expenses: string
          final_closing_date: string | null
          first_closing_date: string | null
          fund_term_years: number | null
          headline: string
          id: string
          investment_period_years: number | null
          is_published: boolean
          management_fee_bps: number | null
          max_investment_cents: number | null
          min_investment_cents: number | null
          offering_id: string
          other_terms: string
          preferred_return_bps: number | null
          published_at: string | null
          reporting: string
          security_type: string
          summary: string
          target_raise_cents: number | null
          transfer_restrictions: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capital_call_terms?: string
          carried_interest_bps?: number | null
          created_at?: string
          distribution_policy?: string
          fees_and_expenses?: string
          final_closing_date?: string | null
          first_closing_date?: string | null
          fund_term_years?: number | null
          headline?: string
          id?: string
          investment_period_years?: number | null
          is_published?: boolean
          management_fee_bps?: number | null
          max_investment_cents?: number | null
          min_investment_cents?: number | null
          offering_id: string
          other_terms?: string
          preferred_return_bps?: number | null
          published_at?: string | null
          reporting?: string
          security_type?: string
          summary?: string
          target_raise_cents?: number | null
          transfer_restrictions?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capital_call_terms?: string
          carried_interest_bps?: number | null
          created_at?: string
          distribution_policy?: string
          fees_and_expenses?: string
          final_closing_date?: string | null
          first_closing_date?: string | null
          fund_term_years?: number | null
          headline?: string
          id?: string
          investment_period_years?: number | null
          is_published?: boolean
          management_fee_bps?: number | null
          max_investment_cents?: number | null
          min_investment_cents?: number | null
          offering_id?: string
          other_terms?: string
          preferred_return_bps?: number | null
          published_at?: string | null
          reporting?: string
          security_type?: string
          summary?: string
          target_raise_cents?: number | null
          transfer_restrictions?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offering_statements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_timeline_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          event_date: string
          event_time: string
          id: string
          is_published: boolean
          kind: string
          offering_id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          event_date: string
          event_time?: string
          id?: string
          is_published?: boolean
          kind?: string
          offering_id: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          event_date?: string
          event_time?: string
          id?: string
          is_published?: boolean
          kind?: string
          offering_id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_timeline_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          client_id: string | null
          closing_cost_cents: number
          closing_cost_rate_id: string | null
          closing_cost_reason: string | null
          closing_cost_source: string
          created_at: string
          date_formed: string | null
          entity_type: string | null
          fund_type: string | null
          fund_type_other: string | null
          id: string
          is_open: boolean
          legal_entity_name: string | null
          min_investment_cents: number
          name: string
          public_headline: string | null
          public_page_enabled: boolean
          public_summary: string | null
          reg_type: Database["public"]["Enums"]["reg_type"]
          share_price_cents: number
          slug: string
          state_formed: string | null
          summary: string | null
          target_raise_cents: number | null
          updated_at: string
          wire_fee_cents: number
          wire_fee_rate_id: string | null
          wire_fee_reason: string | null
          wire_fee_source: string
        }
        Insert: {
          client_id?: string | null
          closing_cost_cents?: number
          closing_cost_rate_id?: string | null
          closing_cost_reason?: string | null
          closing_cost_source?: string
          created_at?: string
          date_formed?: string | null
          entity_type?: string | null
          fund_type?: string | null
          fund_type_other?: string | null
          id?: string
          is_open?: boolean
          legal_entity_name?: string | null
          min_investment_cents?: number
          name: string
          public_headline?: string | null
          public_page_enabled?: boolean
          public_summary?: string | null
          reg_type: Database["public"]["Enums"]["reg_type"]
          share_price_cents?: number
          slug: string
          state_formed?: string | null
          summary?: string | null
          target_raise_cents?: number | null
          updated_at?: string
          wire_fee_cents?: number
          wire_fee_rate_id?: string | null
          wire_fee_reason?: string | null
          wire_fee_source?: string
        }
        Update: {
          client_id?: string | null
          closing_cost_cents?: number
          closing_cost_rate_id?: string | null
          closing_cost_reason?: string | null
          closing_cost_source?: string
          created_at?: string
          date_formed?: string | null
          entity_type?: string | null
          fund_type?: string | null
          fund_type_other?: string | null
          id?: string
          is_open?: boolean
          legal_entity_name?: string | null
          min_investment_cents?: number
          name?: string
          public_headline?: string | null
          public_page_enabled?: boolean
          public_summary?: string | null
          reg_type?: Database["public"]["Enums"]["reg_type"]
          share_price_cents?: number
          slug?: string
          state_formed?: string | null
          summary?: string | null
          target_raise_cents?: number | null
          updated_at?: string
          wire_fee_cents?: number
          wire_fee_rate_id?: string | null
          wire_fee_reason?: string | null
          wire_fee_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_closing_cost_rate_id_fkey"
            columns: ["closing_cost_rate_id"]
            isOneToOne: false
            referencedRelation: "client_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_wire_fee_rate_id_fkey"
            columns: ["wire_fee_rate_id"]
            isOneToOne: false
            referencedRelation: "client_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_step_views: {
        Row: {
          application_id: string
          created_at: string
          first_viewed_at: string
          id: string
          last_viewed_at: string
          offering_id: string
          step: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          application_id: string
          created_at?: string
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          offering_id: string
          step: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          application_id?: string
          created_at?: string
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          offering_id?: string
          step?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_step_views_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_step_views_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      pass_through_expenses: {
        Row: {
          amount_cents: number
          billing_status: string
          client_id: string | null
          created_at: string
          currency: string
          description: string
          id: string
          incurred_on: string
          note: string | null
          offering_id: string | null
          pricing_item_id: string | null
          provider_id: string | null
          recorded_by: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          billing_status?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          description: string
          id?: string
          incurred_on?: string
          note?: string | null
          offering_id?: string | null
          pricing_item_id?: string | null
          provider_id?: string | null
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_status?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          incurred_on?: string
          note?: string | null
          offering_id?: string | null
          pricing_item_id?: string | null
          provider_id?: string | null
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_through_expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_through_expenses_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_through_expenses_pricing_item_id_fkey"
            columns: ["pricing_item_id"]
            isOneToOne: false
            referencedRelation: "pricing_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_through_expenses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "third_party_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_approvals: {
        Row: {
          approver_id: string
          approver_role: string | null
          created_at: string
          decision: string
          id: string
          instruction_id: string
          note: string | null
        }
        Insert: {
          approver_id: string
          approver_role?: string | null
          created_at?: string
          decision: string
          id?: string
          instruction_id: string
          note?: string | null
        }
        Update: {
          approver_id?: string
          approver_role?: string | null
          created_at?: string
          decision?: string
          id?: string
          instruction_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_approvals_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "payment_instructions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_instructions: {
        Row: {
          amount_cents: number
          authorization_reference: string | null
          bank_status: string
          beneficiary_account: string | null
          beneficiary_name: string | null
          callback_note: string | null
          callback_status: string
          client_id: string | null
          compliance_status: string
          created_at: string
          direction: string
          dual_approval_required: boolean
          id: string
          invoice_id: string | null
          note: string | null
          offering_id: string | null
          originating_account: string | null
          pause_reason: string | null
          purpose: string
          requested_at: string
          requested_by: string | null
          status: string
          supporting_document_path: string | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          amount_cents: number
          authorization_reference?: string | null
          bank_status?: string
          beneficiary_account?: string | null
          beneficiary_name?: string | null
          callback_note?: string | null
          callback_status?: string
          client_id?: string | null
          compliance_status?: string
          created_at?: string
          direction?: string
          dual_approval_required?: boolean
          id?: string
          invoice_id?: string | null
          note?: string | null
          offering_id?: string | null
          originating_account?: string | null
          pause_reason?: string | null
          purpose: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          supporting_document_path?: string | null
          updated_at?: string
          verification_status?: string
        }
        Update: {
          amount_cents?: number
          authorization_reference?: string | null
          bank_status?: string
          beneficiary_account?: string | null
          beneficiary_name?: string | null
          callback_note?: string | null
          callback_status?: string
          client_id?: string | null
          compliance_status?: string
          created_at?: string
          direction?: string
          dual_approval_required?: boolean
          id?: string
          invoice_id?: string | null
          note?: string | null
          offering_id?: string | null
          originating_account?: string | null
          pause_reason?: string | null
          purpose?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          supporting_document_path?: string | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_instructions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_instructions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_instructions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
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
      pitch_deck_slides: {
        Row: {
          caption: string | null
          created_at: string
          deck_id: string
          heading: string | null
          id: string
          image_name: string | null
          image_path: string
          offering_id: string
          position: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deck_id: string
          heading?: string | null
          id?: string
          image_name?: string | null
          image_path: string
          offering_id: string
          position?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          deck_id?: string
          heading?: string | null
          id?: string
          image_name?: string | null
          image_path?: string
          offering_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pitch_deck_slides_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "pitch_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_deck_slides_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_decks: {
        Row: {
          created_at: string
          created_by: string | null
          deck_file_name: string | null
          deck_file_path: string | null
          deck_file_size_bytes: number | null
          id: string
          offering_id: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deck_file_name?: string | null
          deck_file_path?: string | null
          deck_file_size_bytes?: number | null
          id?: string
          offering_id: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deck_file_name?: string | null
          deck_file_path?: string | null
          deck_file_size_bytes?: number | null
          id?: string
          offering_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_decks_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_webhook_deliveries: {
        Row: {
          attempts: number
          body_sha256: string
          detail: string | null
          id: string
          item_id: string
          key_id: string | null
          offering_id: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          status: string
          webhook_code: string
          webhook_type: string
        }
        Insert: {
          attempts?: number
          body_sha256: string
          detail?: string | null
          id?: string
          item_id: string
          key_id?: string | null
          offering_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          webhook_code: string
          webhook_type: string
        }
        Update: {
          attempts?: number
          body_sha256?: string
          detail?: string | null
          id?: string
          item_id?: string
          key_id?: string | null
          offering_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          webhook_code?: string
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_webhook_deliveries_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acceptances: {
        Row: {
          accepted_at: string
          document_id: string
          email: string | null
          id: string
          ip_address: string | null
          kind: string
          signer_name: string
          user_agent: string | null
          user_id: string
          version: number
        }
        Insert: {
          accepted_at?: string
          document_id: string
          email?: string | null
          id?: string
          ip_address?: string | null
          kind: string
          signer_name: string
          user_agent?: string | null
          user_id: string
          version: number
        }
        Update: {
          accepted_at?: string
          document_id?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          kind?: string
          signer_name?: string
          user_agent?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "policy_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_documents: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          kind: string
          published: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          kind: string
          published?: boolean
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          kind?: string
          published?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      portal_messages: {
        Row: {
          application_id: string
          body: string
          created_at: string
          id: string
          offering_id: string
          read_at: string | null
          sender_id: string
          sender_name: string | null
          sender_role: string
          updated_at: string
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          id?: string
          offering_id: string
          read_at?: string | null
          sender_id: string
          sender_name?: string | null
          sender_role: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          id?: string
          offering_id?: string
          read_at?: string | null
          sender_id?: string
          sender_name?: string | null
          sender_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_messages_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_items: {
        Row: {
          amount_cents: number | null
          category: string
          condition: string | null
          created_at: string
          id: string
          label: string
          pass_through: boolean
          pricing_model: string
          service_key: string | null
          sort_order: number
          unit: string | null
          version_id: string
        }
        Insert: {
          amount_cents?: number | null
          category?: string
          condition?: string | null
          created_at?: string
          id?: string
          label: string
          pass_through?: boolean
          pricing_model?: string
          service_key?: string | null
          sort_order?: number
          unit?: string | null
          version_id: string
        }
        Update: {
          amount_cents?: number | null
          category?: string
          condition?: string | null
          created_at?: string
          id?: string
          label?: string
          pass_through?: boolean
          pricing_model?: string
          service_key?: string | null
          sort_order?: number
          unit?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "pricing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_versions: {
        Row: {
          created_at: string
          effective_date: string | null
          id: string
          label: string
          published_at: string | null
          published_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_date?: string | null
          id?: string
          label: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_date?: string | null
          id?: string
          label?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      professional_memberships: {
        Row: {
          activated_at: string | null
          created_at: string
          email: string | null
          id: string
          invited_at: string
          invited_by: string | null
          organization_id: string
          removed_at: string | null
          seat_role: string
          status: Database["public"]["Enums"]["professional_membership_status"]
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          organization_id: string
          removed_at?: string | null
          seat_role?: string
          status?: Database["public"]["Enums"]["professional_membership_status"]
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          organization_id?: string
          removed_at?: string | null
          seat_role?: string
          status?: Database["public"]["Enums"]["professional_membership_status"]
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          jurisdiction: string | null
          legal_name: string | null
          name: string
          notes: string | null
          org_type: Database["public"]["Enums"]["professional_org_type"]
          registration_number: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction?: string | null
          legal_name?: string | null
          name: string
          notes?: string | null
          org_type?: Database["public"]["Enums"]["professional_org_type"]
          registration_number?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction?: string | null
          legal_name?: string | null
          name?: string
          notes?: string | null
          org_type?: Database["public"]["Enums"]["professional_org_type"]
          registration_number?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_persona_id: string | null
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
          active_persona_id?: string | null
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
          active_persona_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "profiles_active_persona_id_fkey"
            columns: ["active_persona_id"]
            isOneToOne: false
            referencedRelation: "investor_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_agreement_conditions: {
        Row: {
          agreement_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          detail: string | null
          evidence_url: string | null
          id: string
          label: string
          met: boolean
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          agreement_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          detail?: string | null
          evidence_url?: string | null
          id?: string
          label: string
          met?: boolean
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          agreement_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          detail?: string | null
          evidence_url?: string | null
          id?: string
          label?: string
          met?: boolean
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_agreement_conditions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "provider_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_agreement_rates: {
        Row: {
          agreement_id: string
          amount_cents: number
          basis: string
          billed_to_client: boolean
          cap_cents: number | null
          created_at: string
          description: string | null
          id: string
          label: string
          minimum_cents: number | null
          note: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          agreement_id: string
          amount_cents?: number
          basis?: string
          billed_to_client?: boolean
          cap_cents?: number | null
          created_at?: string
          description?: string | null
          id?: string
          label: string
          minimum_cents?: number | null
          note?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          agreement_id?: string
          amount_cents?: number
          basis?: string
          billed_to_client?: boolean
          cap_cents?: number | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          minimum_cents?: number | null
          note?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_agreement_rates_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "provider_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_agreements: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          document_url: string | null
          end_date: string | null
          harmonious_signed_at: string | null
          harmonious_signer_name: string | null
          harmonious_signer_title: string | null
          id: string
          note: string | null
          notice_days: number
          provider_id: string
          provider_signed_at: string | null
          provider_signer_name: string | null
          provider_signer_title: string | null
          reference: string | null
          scope_summary: string | null
          services: string[]
          start_date: string | null
          status: string
          terminated_at: string | null
          termination_reason: string | null
          title: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_url?: string | null
          end_date?: string | null
          harmonious_signed_at?: string | null
          harmonious_signer_name?: string | null
          harmonious_signer_title?: string | null
          id?: string
          note?: string | null
          notice_days?: number
          provider_id: string
          provider_signed_at?: string | null
          provider_signer_name?: string | null
          provider_signer_title?: string | null
          reference?: string | null
          scope_summary?: string | null
          services?: string[]
          start_date?: string | null
          status?: string
          terminated_at?: string | null
          termination_reason?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_url?: string | null
          end_date?: string | null
          harmonious_signed_at?: string | null
          harmonious_signer_name?: string | null
          harmonious_signer_title?: string | null
          id?: string
          note?: string | null
          notice_days?: number
          provider_id?: string
          provider_signed_at?: string | null
          provider_signer_name?: string | null
          provider_signer_title?: string | null
          reference?: string | null
          scope_summary?: string | null
          services?: string[]
          start_date?: string | null
          status?: string
          terminated_at?: string | null
          termination_reason?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_agreements_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "third_party_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_documents: {
        Row: {
          created_at: string
          doc_type: string
          expires_on: string | null
          file_name: string | null
          file_path: string
          id: string
          note: string | null
          provider_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_type?: string
          expires_on?: string | null
          file_name?: string | null
          file_path: string
          id?: string
          note?: string | null
          provider_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          expires_on?: string | null
          file_name?: string | null
          file_path?: string
          id?: string
          note?: string | null
          provider_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_documents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "third_party_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_expense_submissions: {
        Row: {
          amount_cents: number
          client_id: string | null
          created_at: string
          currency: string
          description: string
          expense_id: string | null
          file_path: string | null
          id: string
          incurred_on: string
          note: string | null
          offering_id: string | null
          provider_id: string
          reference: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          client_id?: string | null
          created_at?: string
          currency?: string
          description: string
          expense_id?: string | null
          file_path?: string | null
          id?: string
          incurred_on: string
          note?: string | null
          offering_id?: string | null
          provider_id: string
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          expense_id?: string | null
          file_path?: string | null
          id?: string
          incurred_on?: string
          note?: string | null
          offering_id?: string | null
          provider_id?: string
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_expense_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_expense_submissions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "pass_through_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_expense_submissions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_expense_submissions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "third_party_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_users: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          provider_id: string
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          provider_id: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          provider_id?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_users_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "third_party_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      record_retention: {
        Row: {
          client_id: string | null
          created_at: string
          data_classification: string
          hold_reason: string | null
          id: string
          legal_hold: boolean
          note: string | null
          offering_id: string | null
          record_label: string
          retain_until: string | null
          retention_category: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          data_classification?: string
          hold_reason?: string | null
          id?: string
          legal_hold?: boolean
          note?: string | null
          offering_id?: string | null
          record_label: string
          retain_until?: string | null
          retention_category?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          data_classification?: string
          hold_reason?: string | null
          id?: string
          legal_hold?: boolean
          note?: string | null
          offering_id?: string | null
          record_label?: string
          retain_until?: string | null
          retention_category?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_retention_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_retention_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibility_items: {
        Row: {
          client_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          detail: string | null
          due_on: string | null
          id: string
          label: string
          note: string | null
          offering_id: string | null
          owner: string
          phase: string
          status: string
          template_key: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_on?: string | null
          id?: string
          label: string
          note?: string | null
          offering_id?: string | null
          owner?: string
          phase?: string
          status?: string
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_on?: string | null
          id?: string
          label?: string
          note?: string | null
          offering_id?: string | null
          owner?: string
          phase?: string
          status?: string
          template_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibility_items_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibility_templates: {
        Row: {
          active: boolean
          created_at: string
          detail: string | null
          id: string
          key: string
          label: string
          lead_time_note: string | null
          owner: string
          phase: string
          service_key: string | null
          sort_order: number
          source_reference: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          detail?: string | null
          id?: string
          key: string
          label: string
          lead_time_note?: string | null
          owner?: string
          phase?: string
          service_key?: string | null
          sort_order?: number
          source_reference?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          detail?: string | null
          id?: string
          key?: string
          label?: string
          lead_time_note?: string | null
          owner?: string
          phase?: string
          service_key?: string | null
          sort_order?: number
          source_reference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviewer_activity: {
        Row: {
          action: string
          actor_id: string
          application_id: string | null
          area: string | null
          created_at: string
          id: string
          metadata: Json
          note: string | null
          offering_id: string | null
          outcome: string | null
          summary: string
        }
        Insert: {
          action: string
          actor_id: string
          application_id?: string | null
          area?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          offering_id?: string | null
          outcome?: string | null
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string
          application_id?: string | null
          area?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          offering_id?: string | null
          outcome?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewer_activity_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviewer_activity_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_job_runs: {
        Row: {
          job_key: string
          last_run_at: string
          last_run_on: string
        }
        Insert: {
          job_key: string
          last_run_at?: string
          last_run_on: string
        }
        Update: {
          job_key?: string
          last_run_at?: string
          last_run_on?: string
        }
        Relationships: []
      }
      service_catalog: {
        Row: {
          active: boolean
          applicable_entity_types: string[]
          billing_frequency: string
          category: string
          client_handles: string | null
          contract_terms: string | null
          created_at: string
          default_pricing_model: string
          delivery_workflow: string | null
          dependencies: string[]
          description: string | null
          harmonious_handles: string | null
          id: string
          internal_owner: string | null
          key: string
          material: boolean
          name: string
          onboarding_workflow: string | null
          renewal_rule: string | null
          required_approvals: string[]
          required_checks: string[]
          required_documents: string[]
          required_information: string[]
          service_code: string | null
          sort_order: number
          standard_deliverables: string[]
          standard_exclusions: string[]
          standard_price_cents: number
          standard_scope: string | null
          status: string
          third_party_dependency: string | null
          third_party_handles: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          applicable_entity_types?: string[]
          billing_frequency?: string
          category: string
          client_handles?: string | null
          contract_terms?: string | null
          created_at?: string
          default_pricing_model?: string
          delivery_workflow?: string | null
          dependencies?: string[]
          description?: string | null
          harmonious_handles?: string | null
          id?: string
          internal_owner?: string | null
          key: string
          material?: boolean
          name: string
          onboarding_workflow?: string | null
          renewal_rule?: string | null
          required_approvals?: string[]
          required_checks?: string[]
          required_documents?: string[]
          required_information?: string[]
          service_code?: string | null
          sort_order?: number
          standard_deliverables?: string[]
          standard_exclusions?: string[]
          standard_price_cents?: number
          standard_scope?: string | null
          status?: string
          third_party_dependency?: string | null
          third_party_handles?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          applicable_entity_types?: string[]
          billing_frequency?: string
          category?: string
          client_handles?: string | null
          contract_terms?: string | null
          created_at?: string
          default_pricing_model?: string
          delivery_workflow?: string | null
          dependencies?: string[]
          description?: string | null
          harmonious_handles?: string | null
          id?: string
          internal_owner?: string | null
          key?: string
          material?: boolean
          name?: string
          onboarding_workflow?: string | null
          renewal_rule?: string | null
          required_approvals?: string[]
          required_checks?: string[]
          required_documents?: string[]
          required_information?: string[]
          service_code?: string | null
          sort_order?: number
          standard_deliverables?: string[]
          standard_exclusions?: string[]
          standard_price_cents?: number
          standard_scope?: string | null
          status?: string
          third_party_dependency?: string | null
          third_party_handles?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_entitlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_handles: string | null
          client_id: string
          created_at: string
          created_by: string | null
          effective_date: string | null
          harmonious_handles: string | null
          id: string
          note: string | null
          offering_id: string | null
          pricing_model: string | null
          required_approvals: string[]
          required_checks: string[]
          required_documents: string[]
          service_key: string
          sow_id: string | null
          status: string
          termination_date: string | null
          third_party_dependency: string | null
          third_party_handles: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_handles?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          harmonious_handles?: string | null
          id?: string
          note?: string | null
          offering_id?: string | null
          pricing_model?: string | null
          required_approvals?: string[]
          required_checks?: string[]
          required_documents?: string[]
          service_key: string
          sow_id?: string | null
          status?: string
          termination_date?: string | null
          third_party_dependency?: string | null
          third_party_handles?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_handles?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          harmonious_handles?: string | null
          id?: string
          note?: string | null
          offering_id?: string | null
          pricing_model?: string | null
          required_approvals?: string[]
          required_checks?: string[]
          required_documents?: string[]
          service_key?: string
          sow_id?: string | null
          status?: string
          termination_date?: string | null
          third_party_dependency?: string | null
          third_party_handles?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_entitlements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_entitlements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_entitlements_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "service_entitlements_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      service_package_items: {
        Row: {
          created_at: string
          id: string
          optional: boolean
          package_id: string
          service_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          optional?: boolean
          package_id: string
          service_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          optional?: boolean
          package_id?: string
          service_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_package_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          applicable_entity_types: string[]
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          applicable_entity_types?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          applicable_entity_types?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          activated_entitlement_id: string | null
          amendment_path: string | null
          amendment_terms: string | null
          client_approved_at: string | null
          client_approved_by: string | null
          client_id: string
          created_at: string
          declined_reason: string | null
          effective_date: string | null
          fee_override_reason: string | null
          fee_rate_id: string | null
          fee_source: string | null
          id: string
          offering_id: string | null
          proposed_fee_cents: number | null
          proposed_pricing_model: string | null
          requested_by: string | null
          requester_note: string | null
          review_note: string | null
          reviewer_id: string | null
          service_key: string
          signed_ip: string | null
          signer_name: string | null
          signer_title: string | null
          sow_id: string | null
          status: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          activated_entitlement_id?: string | null
          amendment_path?: string | null
          amendment_terms?: string | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id: string
          created_at?: string
          declined_reason?: string | null
          effective_date?: string | null
          fee_override_reason?: string | null
          fee_rate_id?: string | null
          fee_source?: string | null
          id?: string
          offering_id?: string | null
          proposed_fee_cents?: number | null
          proposed_pricing_model?: string | null
          requested_by?: string | null
          requester_note?: string | null
          review_note?: string | null
          reviewer_id?: string | null
          service_key: string
          signed_ip?: string | null
          signer_name?: string | null
          signer_title?: string | null
          sow_id?: string | null
          status?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          activated_entitlement_id?: string | null
          amendment_path?: string | null
          amendment_terms?: string | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id?: string
          created_at?: string
          declined_reason?: string | null
          effective_date?: string | null
          fee_override_reason?: string | null
          fee_rate_id?: string | null
          fee_source?: string | null
          id?: string
          offering_id?: string | null
          proposed_fee_cents?: number | null
          proposed_pricing_model?: string | null
          requested_by?: string | null
          requester_note?: string | null
          review_note?: string | null
          reviewer_id?: string | null
          service_key?: string
          signed_ip?: string | null
          signer_name?: string | null
          signer_title?: string | null
          sow_id?: string | null
          status?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_activated_entitlement_id_fkey"
            columns: ["activated_entitlement_id"]
            isOneToOne: false
            referencedRelation: "service_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_fee_rate_id_fkey"
            columns: ["fee_rate_id"]
            isOneToOne: false
            referencedRelation: "client_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
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
      sow_amendments: {
        Row: {
          amendment_no: number
          client_id: string
          created_at: string
          created_by: string | null
          effective_date: string | null
          executed_at: string | null
          existing_terms: string
          id: string
          new_terms: string
          requested_change: string
          sow_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amendment_no?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          executed_at?: string | null
          existing_terms: string
          id?: string
          new_terms: string
          requested_change: string
          sow_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amendment_no?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          executed_at?: string | null
          existing_terms?: string
          id?: string
          new_terms?: string
          requested_change?: string
          sow_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_amendments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_amendments_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_pricing_lines: {
        Row: {
          adjustment_reason: string | null
          created_at: string
          final_cents: number
          id: string
          included: boolean
          label: string
          optional: boolean
          pass_through: boolean
          pricing_model: string
          service_key: string
          snapshot_id: string
          sort_order: number
          standard_cents: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          adjustment_reason?: string | null
          created_at?: string
          final_cents?: number
          id?: string
          included?: boolean
          label: string
          optional?: boolean
          pass_through?: boolean
          pricing_model?: string
          service_key: string
          snapshot_id: string
          sort_order?: number
          standard_cents?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          adjustment_reason?: string | null
          created_at?: string
          final_cents?: number
          id?: string
          included?: boolean
          label?: string
          optional?: boolean
          pass_through?: boolean
          pricing_model?: string
          service_key?: string
          snapshot_id?: string
          sort_order?: number
          standard_cents?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_pricing_lines_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "sow_pricing_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_pricing_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string | null
          id: string
          locked: boolean
          sow_id: string
          updated_at: string
          version_id: string | null
          version_label: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          locked?: boolean
          sow_id: string
          updated_at?: string
          version_id?: string | null
          version_label: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          locked?: boolean
          sow_id?: string
          updated_at?: string
          version_id?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_pricing_snapshots_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: true
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_pricing_snapshots_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "pricing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_section_approvals: {
        Row: {
          created_at: string
          decided_at: string
          decided_by: string | null
          id: string
          section_id: string
          sow_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          id?: string
          section_id: string
          sow_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          id?: string
          section_id?: string
          sow_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_section_approvals_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: true
            referencedRelation: "sow_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sow_section_approvals_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      sow_sections: {
        Row: {
          body: string
          created_at: string
          id: string
          key: string
          section_no: string
          sort_order: number
          sow_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          key: string
          section_no: string
          sort_order?: number
          sow_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          key?: string
          section_no?: string
          sort_order?: number
          sow_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sow_sections_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "client_sows"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
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
          role: Database["public"]["Enums"]["app_role"]
          status?: string
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
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          application_id: string
          commitment_cents: number
          confirmed_at: string | null
          confirmed_ip: string | null
          confirmed_user_agent: string | null
          created_at: string
          id: string
          ownership_title: string | null
          payment_method: string | null
          signed_name: string | null
          status: string
          tax_classification: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          commitment_cents: number
          confirmed_at?: string | null
          confirmed_ip?: string | null
          confirmed_user_agent?: string | null
          created_at?: string
          id?: string
          ownership_title?: string | null
          payment_method?: string | null
          signed_name?: string | null
          status?: string
          tax_classification?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          commitment_cents?: number
          confirmed_at?: string | null
          confirmed_ip?: string | null
          confirmed_user_agent?: string | null
          created_at?: string
          id?: string
          ownership_title?: string | null
          payment_method?: string | null
          signed_name?: string | null
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
      third_party_providers: {
        Row: {
          contract_status: string
          created_at: string
          data_categories: string[]
          id: string
          name: string
          outage_note: string | null
          provider_type: string
          retired_at: string | null
          security_doc_url: string | null
          service_dependency: string | null
          sla: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contract_status?: string
          created_at?: string
          data_categories?: string[]
          id?: string
          name: string
          outage_note?: string | null
          provider_type: string
          retired_at?: string | null
          security_doc_url?: string | null
          service_dependency?: string | null
          sla?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contract_status?: string
          created_at?: string
          data_categories?: string[]
          id?: string
          name?: string
          outage_note?: string | null
          provider_type?: string
          retired_at?: string | null
          security_doc_url?: string | null
          service_dependency?: string | null
          sla?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      wire_requests: {
        Row: {
          amount_cents: number
          application_id: string | null
          created_at: string
          expected_date: string | null
          id: string
          note: string | null
          offering_id: string
          purpose: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          settled_amount_cents: number | null
          settled_at: string | null
          settled_transaction_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          application_id?: string | null
          created_at?: string
          expected_date?: string | null
          id?: string
          note?: string | null
          offering_id: string
          purpose?: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          settled_amount_cents?: number | null
          settled_at?: string | null
          settled_transaction_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          application_id?: string | null
          created_at?: string
          expected_date?: string | null
          id?: string
          note?: string | null
          offering_id?: string
          purpose?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          settled_amount_cents?: number | null
          settled_at?: string | null
          settled_transaction_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wire_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wire_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wire_requests_settled_transaction_id_fkey"
            columns: ["settled_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_service_quote: {
        Args: {
          _request_id: string
          _signer_name: string
          _signer_title?: string
        }
        Returns: undefined
      }
      can_manage_diligence: { Args: { _offering_id: string }; Returns: boolean }
      can_read_wire_instructions: {
        Args: { _offering_id: string }
        Returns: boolean
      }
      can_review_operations: { Args: never; Returns: boolean }
      can_view_diligence: { Args: { _offering_id: string }; Returns: boolean }
      cap_holder_can_view: {
        Args: { _stakeholder_id: string }
        Returns: boolean
      }
      client_create_wire_request: {
        Args: {
          _amount_cents: number
          _expected_date?: string
          _note?: string
          _offering_id: string
          _purpose?: string
        }
        Returns: string
      }
      client_declare_invoice_payment: {
        Args: {
          _invoice_id: string
          _method: string
          _note?: string
          _paid_on: string
          _reference?: string
        }
        Returns: undefined
      }
      client_send_back_sow: {
        Args: { _reason: string; _sow_id: string }
        Returns: undefined
      }
      client_sign_sow: {
        Args: {
          _ip?: string
          _name: string
          _sow_id: string
          _title?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      ct_can_manage: { Args: { _company_id: string }; Returns: boolean }
      ct_can_view: { Args: { _company_id: string }; Returns: boolean }
      ct_is_holder: { Args: { _stakeholder_id: string }; Returns: boolean }
      ct_is_staff: { Args: never; Returns: boolean }
      diligence_access_open: {
        Args: { _offering_id: string }
        Returns: boolean
      }
      diligence_cap_table_visible: {
        Args: { _offering_id: string }
        Returns: boolean
      }
      diligence_doc_allowed: {
        Args: { _document_id: string }
        Returns: boolean
      }
      fund_condition_context: { Args: { p_offering_id: string }; Returns: Json }
      get_bank_access_token: {
        Args: { p_offering_id: string }
        Returns: string
      }
      get_bank_link_by_item: {
        Args: { p_item_id: string }
        Returns: {
          access_token: string
          created_by: string
          offering_id: string
        }[]
      }
      get_offering_entity_details: {
        Args: { p_offering_id: string }
        Returns: {
          ein: string
          ein_review_status: string
          has_ein: boolean
          offering_id: string
          review_note: string
          reviewed_at: string
          ss4: Json
          ss4_generated_at: string
          ss4_review_status: string
          ss4_storage_path: string
          updated_at: string
        }[]
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
      is_any_staff: { Args: never; Returns: boolean }
      is_client_member: { Args: { _client_id: string }; Returns: boolean }
      is_contract_staff: { Args: never; Returns: boolean }
      list_admin_review: {
        Args: never
        Returns: {
          company_domain: boolean
          created_at: string
          email: string
          last_sign_in_at: string
          legal_name: string
          role_granted_at: string
          roles: string[]
          user_id: string
        }[]
      }
      list_entity_reviews: {
        Args: never
        Returns: {
          ein_masked: string
          ein_review_status: string
          has_ein: boolean
          has_ss4_file: boolean
          offering_id: string
          review_note: string
          reviewed_at: string
          ss4_generated_at: string
          ss4_review_status: string
          updated_at: string
        }[]
      }
      list_staff_accounts: {
        Args: never
        Returns: {
          created_at: string
          email: string
          last_sign_in_at: string
          legal_name: string
          roles: string[]
          user_id: string
        }[]
      }
      list_wire_instructions: {
        Args: never
        Returns: {
          details: Json
          offering_id: string
          updated_at: string
        }[]
      }
      remove_bank_link: { Args: { p_offering_id: string }; Returns: undefined }
      respond_to_invoice: {
        Args: {
          _decision: string
          _invoice_id: string
          _reason?: string
          _signer_name?: string
        }
        Returns: undefined
      }
      review_offering_entity: {
        Args: {
          p_ein_status: string
          p_note: string
          p_offering_id: string
          p_ss4_status: string
        }
        Returns: undefined
      }
      save_bank_link: {
        Args: {
          p_access_token: string
          p_institution: string
          p_item_id: string
          p_offering_id: string
        }
        Returns: undefined
      }
      save_offering_entity_details: {
        Args: {
          p_ein: string
          p_has_ein: boolean
          p_offering_id: string
          p_ss4: Json
        }
        Returns: undefined
      }
      save_offering_ss4_file: {
        Args: { p_offering_id: string; p_path: string }
        Returns: undefined
      }
      save_wire_instructions: {
        Args: { p_details: Json; p_offering_id: string }
        Returns: undefined
      }
      set_staff_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      withdraw_service_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "investor"
        | "fund_manager"
        | "operations"
        | "super_admin"
        | "legal"
        | "compliance"
        | "fund_administration"
        | "tax"
        | "finance"
        | "client_success"
        | "executive"
        | "client_gp"
        | "client_signatory"
        | "client_finance"
        | "client_legal"
        | "client_compliance"
        | "client_readonly"
        | "entity_representative"
        | "beneficial_owner"
      check_status:
        | "not_started"
        | "pending"
        | "review"
        | "approved"
        | "declined"
      delegation_authority_level:
        | "view"
        | "assist"
        | "limited_proxy"
        | "authorized_signatory"
        | "transaction_authority"
      delegation_capability:
        | "view_profile"
        | "edit_profile_info"
        | "view_investments"
        | "prepare_investment"
        | "initiate_investment"
        | "view_documents"
        | "upload_documents"
        | "view_tax_documents"
        | "view_financial_statements"
        | "view_compliance_status"
        | "assist_kyc"
        | "assist_kyb"
        | "assist_accreditation"
        | "view_capital_calls"
        | "view_distributions"
        | "view_banking_info"
        | "view_wire_instructions"
        | "sign_specified_documents"
        | "approve_specified_actions"
      delegation_scope_type:
        | "person"
        | "investment_profile"
        | "fund"
        | "investment"
        | "data_category"
      delegation_status:
        | "pending"
        | "active"
        | "suspended"
        | "revoked"
        | "expired"
      funding_method: "wire" | "ach"
      investor_type: "individual" | "joint" | "entity" | "trust" | "ira"
      invitation_role: "investor" | "fund_manager"
      payment_status:
        | "not_started"
        | "awaiting_wire"
        | "processing"
        | "settled"
        | "failed"
        | "returned"
        | "cancelled"
      professional_membership_status:
        | "invited"
        | "active"
        | "suspended"
        | "removed"
      professional_org_type:
        | "investment_adviser"
        | "broker_dealer"
        | "law_firm"
        | "accounting_firm"
        | "family_office"
        | "wealth_manager"
        | "tax_advisor"
        | "trustee_fiduciary"
        | "custodian"
        | "consultant"
        | "fund_manager_gp"
        | "administrator"
        | "placement_agent"
        | "other"
      reg_type: "506b" | "506c" | "regcf" | "rega" | "regaplus"
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
      app_role: [
        "admin",
        "investor",
        "fund_manager",
        "operations",
        "super_admin",
        "legal",
        "compliance",
        "fund_administration",
        "tax",
        "finance",
        "client_success",
        "executive",
        "client_gp",
        "client_signatory",
        "client_finance",
        "client_legal",
        "client_compliance",
        "client_readonly",
        "entity_representative",
        "beneficial_owner",
      ],
      check_status: [
        "not_started",
        "pending",
        "review",
        "approved",
        "declined",
      ],
      delegation_authority_level: [
        "view",
        "assist",
        "limited_proxy",
        "authorized_signatory",
        "transaction_authority",
      ],
      delegation_capability: [
        "view_profile",
        "edit_profile_info",
        "view_investments",
        "prepare_investment",
        "initiate_investment",
        "view_documents",
        "upload_documents",
        "view_tax_documents",
        "view_financial_statements",
        "view_compliance_status",
        "assist_kyc",
        "assist_kyb",
        "assist_accreditation",
        "view_capital_calls",
        "view_distributions",
        "view_banking_info",
        "view_wire_instructions",
        "sign_specified_documents",
        "approve_specified_actions",
      ],
      delegation_scope_type: [
        "person",
        "investment_profile",
        "fund",
        "investment",
        "data_category",
      ],
      delegation_status: [
        "pending",
        "active",
        "suspended",
        "revoked",
        "expired",
      ],
      funding_method: ["wire", "ach"],
      investor_type: ["individual", "joint", "entity", "trust", "ira"],
      invitation_role: ["investor", "fund_manager"],
      payment_status: [
        "not_started",
        "awaiting_wire",
        "processing",
        "settled",
        "failed",
        "returned",
        "cancelled",
      ],
      professional_membership_status: [
        "invited",
        "active",
        "suspended",
        "removed",
      ],
      professional_org_type: [
        "investment_adviser",
        "broker_dealer",
        "law_firm",
        "accounting_firm",
        "family_office",
        "wealth_manager",
        "tax_advisor",
        "trustee_fiduciary",
        "custodian",
        "consultant",
        "fund_manager_gp",
        "administrator",
        "placement_agent",
        "other",
      ],
      reg_type: ["506b", "506c", "regcf", "rega", "regaplus"],
    },
  },
} as const
