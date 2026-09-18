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
      accounting_exceptions: {
        Row: {
          bank_transaction_id: string | null
          book_id: string | null
          context: Json
          created_at: string
          detail: string | null
          id: string
          is_material: boolean
          journal_entry_id: string | null
          kind: Database["public"]["Enums"]["accounting_exception_kind"]
          offering_id: string | null
          opened_at: string
          opened_by: string | null
          period_id: string | null
          reconciliation_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["accounting_exception_status"]
          updated_at: string
        }
        Insert: {
          bank_transaction_id?: string | null
          book_id?: string | null
          context?: Json
          created_at?: string
          detail?: string | null
          id?: string
          is_material?: boolean
          journal_entry_id?: string | null
          kind: Database["public"]["Enums"]["accounting_exception_kind"]
          offering_id?: string | null
          opened_at?: string
          opened_by?: string | null
          period_id?: string | null
          reconciliation_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["accounting_exception_status"]
          updated_at?: string
        }
        Update: {
          bank_transaction_id?: string | null
          book_id?: string | null
          context?: Json
          created_at?: string
          detail?: string | null
          id?: string
          is_material?: boolean
          journal_entry_id?: string | null
          kind?: Database["public"]["Enums"]["accounting_exception_kind"]
          offering_id?: string | null
          opened_at?: string
          opened_by?: string | null
          period_id?: string | null
          reconciliation_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["accounting_exception_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_exceptions_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_exceptions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_exceptions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_exceptions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_exceptions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_exceptions_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "bank_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_period_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["accounting_period_status"]
            | null
          id: string
          period_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["accounting_period_status"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["accounting_period_status"]
            | null
          id?: string
          period_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["accounting_period_status"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["accounting_period_status"]
            | null
          id?: string
          period_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["accounting_period_status"]
        }
        Relationships: [
          {
            foreignKeyName: "accounting_period_events_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          book_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          label: string
          locked_at: string | null
          locked_by: string | null
          period_end: string
          period_start: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          review_started_at: string | null
          soft_closed_at: string | null
          soft_closed_by: string | null
          status: Database["public"]["Enums"]["accounting_period_status"]
          updated_at: string
        }
        Insert: {
          book_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          label: string
          locked_at?: string | null
          locked_by?: string | null
          period_end: string
          period_start: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          review_started_at?: string | null
          soft_closed_at?: string | null
          soft_closed_by?: string | null
          status?: Database["public"]["Enums"]["accounting_period_status"]
          updated_at?: string
        }
        Update: {
          book_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          label?: string
          locked_at?: string | null
          locked_by?: string | null
          period_end?: string
          period_start?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          review_started_at?: string | null
          soft_closed_at?: string | null
          soft_closed_by?: string | null
          status?: Database["public"]["Enums"]["accounting_period_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_workpapers: {
        Row: {
          book_id: string | null
          created_at: string
          exceptions: Json
          figures: Json
          id: string
          kind: string
          note: string | null
          offering_id: string | null
          period_end: string
          period_id: string | null
          period_start: string | null
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shared_with_manager: boolean
          signed_off_at: string | null
          signed_off_by: string | null
          source_records: Json
          status: string
          support: Json
          title: string
          updated_at: string
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          exceptions?: Json
          figures?: Json
          id?: string
          kind: string
          note?: string | null
          offering_id?: string | null
          period_end: string
          period_id?: string | null
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_with_manager?: boolean
          signed_off_at?: string | null
          signed_off_by?: string | null
          source_records?: Json
          status?: string
          support?: Json
          title: string
          updated_at?: string
        }
        Update: {
          book_id?: string | null
          created_at?: string
          exceptions?: Json
          figures?: Json
          id?: string
          kind?: string
          note?: string | null
          offering_id?: string | null
          period_end?: string
          period_id?: string | null
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_with_manager?: boolean
          signed_off_at?: string | null
          signed_off_by?: string | null
          source_records?: Json
          status?: string
          support?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_workpapers_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_workpapers_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_workpapers_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
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
      allocation_events: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          created_at: string
          from_status: string | null
          id: string
          offering_id: string | null
          payload: Json
          position_id: string | null
          reason: string | null
          run_id: string | null
          statement_id: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          offering_id?: string | null
          payload?: Json
          position_id?: string | null
          reason?: string | null
          run_id?: string | null
          statement_id?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          offering_id?: string | null
          payload?: Json
          position_id?: string | null
          reason?: string | null
          run_id?: string | null
          statement_id?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_events_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_events_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "investor_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_lines: {
        Row: {
          allocated_income_cents: number
          allocated_loss_cents: number
          basis: string
          basis_amount_cents: number
          beginning_capital_cents: number
          carried_interest_cents: number
          class_id: string | null
          commitment_cents: number
          contributed_to_date_cents: number
          contributions_cents: number
          created_at: string
          days_in_period: number | null
          distributions_cents: number
          ending_capital_cents: number
          fund_expenses_cents: number
          id: string
          inputs: Json
          management_fees_cents: number
          offering_id: string
          other_adjustments_cents: number
          ownership_pct: number | null
          position_id: string
          realized_gain_cents: number
          run_id: string
          tax_allocations: Json
          unfunded_commitment_cents: number
          units: number | null
          unrealized_gain_cents: number
          weight: number
        }
        Insert: {
          allocated_income_cents?: number
          allocated_loss_cents?: number
          basis: string
          basis_amount_cents?: number
          beginning_capital_cents?: number
          carried_interest_cents?: number
          class_id?: string | null
          commitment_cents?: number
          contributed_to_date_cents?: number
          contributions_cents?: number
          created_at?: string
          days_in_period?: number | null
          distributions_cents?: number
          ending_capital_cents?: number
          fund_expenses_cents?: number
          id?: string
          inputs?: Json
          management_fees_cents?: number
          offering_id: string
          other_adjustments_cents?: number
          ownership_pct?: number | null
          position_id: string
          realized_gain_cents?: number
          run_id: string
          tax_allocations?: Json
          unfunded_commitment_cents?: number
          units?: number | null
          unrealized_gain_cents?: number
          weight?: number
        }
        Update: {
          allocated_income_cents?: number
          allocated_loss_cents?: number
          basis?: string
          basis_amount_cents?: number
          beginning_capital_cents?: number
          carried_interest_cents?: number
          class_id?: string | null
          commitment_cents?: number
          contributed_to_date_cents?: number
          contributions_cents?: number
          created_at?: string
          days_in_period?: number | null
          distributions_cents?: number
          ending_capital_cents?: number
          fund_expenses_cents?: number
          id?: string
          inputs?: Json
          management_fees_cents?: number
          offering_id?: string
          other_adjustments_cents?: number
          ownership_pct?: number | null
          position_id?: string
          realized_gain_cents?: number
          run_id?: string
          tax_allocations?: Json
          unfunded_commitment_cents?: number
          units?: number | null
          unrealized_gain_cents?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_lines_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "investor_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_lines_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_lines_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_policies: {
        Row: {
          basis: string
          created_at: string
          documented_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          manager_workflow: string
          methodology: string
          methodology_note: string | null
          offering_id: string
          rounding: string
          settings: Json
          spv_simple: boolean
          time_weighted: boolean
          tolerance_cents: number
          updated_at: string
          version: number
        }
        Insert: {
          basis?: string
          created_at?: string
          documented_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          manager_workflow?: string
          methodology?: string
          methodology_note?: string | null
          offering_id: string
          rounding?: string
          settings?: Json
          spv_simple?: boolean
          time_weighted?: boolean
          tolerance_cents?: number
          updated_at?: string
          version?: number
        }
        Update: {
          basis?: string
          created_at?: string
          documented_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          manager_workflow?: string
          methodology?: string
          methodology_note?: string | null
          offering_id?: string
          rounding?: string
          settings?: Json
          spv_simple?: boolean
          time_weighted?: boolean
          tolerance_cents?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_policies_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_runs: {
        Row: {
          allocated_totals: Json
          approved_at: string | null
          approved_by: string | null
          book_id: string | null
          created_at: string
          difference_cents: number
          exceptions: Json
          finalized_at: string | null
          finalized_by: string | null
          fund_totals: Json
          id: string
          inputs_snapshot: Json
          manager_note: string | null
          manager_responded_at: string | null
          manager_responded_by: string | null
          manager_response: string | null
          nav_version_id: string | null
          offering_id: string
          period_end: string
          period_id: string | null
          period_start: string
          policy_id: string | null
          policy_snapshot: Json
          prepared_at: string
          prepared_by: string | null
          reconciliation: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source_cutoff_at: string
          status: string
          supersedes_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          allocated_totals?: Json
          approved_at?: string | null
          approved_by?: string | null
          book_id?: string | null
          created_at?: string
          difference_cents?: number
          exceptions?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          fund_totals?: Json
          id?: string
          inputs_snapshot?: Json
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          nav_version_id?: string | null
          offering_id: string
          period_end: string
          period_id?: string | null
          period_start: string
          policy_id?: string | null
          policy_snapshot?: Json
          prepared_at?: string
          prepared_by?: string | null
          reconciliation?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_cutoff_at?: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          allocated_totals?: Json
          approved_at?: string | null
          approved_by?: string | null
          book_id?: string | null
          created_at?: string
          difference_cents?: number
          exceptions?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          fund_totals?: Json
          id?: string
          inputs_snapshot?: Json
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          nav_version_id?: string | null
          offering_id?: string
          period_end?: string
          period_id?: string | null
          period_start?: string
          policy_id?: string | null
          policy_snapshot?: Json
          prepared_at?: string
          prepared_by?: string | null
          reconciliation?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_cutoff_at?: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_runs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "allocation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
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
      asset_valuations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          asset_class: string
          asset_name: string
          book_id: string
          cost_basis_cents: number
          created_at: string
          ct_company_id: string | null
          ct_security_id: string | null
          id: string
          methodology: string
          note: string | null
          offering_id: string | null
          ownership_pct: number | null
          prepared_by: string | null
          prior_valuation_id: string | null
          quantity: number | null
          realized_change_cents: number
          reviewed_by: string | null
          source: string | null
          status: Database["public"]["Enums"]["valuation_status"]
          supporting_document_path: string | null
          unrealized_change_cents: number
          updated_at: string
          valuation_date: string
          value_cents: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asset_class?: string
          asset_name: string
          book_id: string
          cost_basis_cents?: number
          created_at?: string
          ct_company_id?: string | null
          ct_security_id?: string | null
          id?: string
          methodology?: string
          note?: string | null
          offering_id?: string | null
          ownership_pct?: number | null
          prepared_by?: string | null
          prior_valuation_id?: string | null
          quantity?: number | null
          realized_change_cents?: number
          reviewed_by?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["valuation_status"]
          supporting_document_path?: string | null
          unrealized_change_cents?: number
          updated_at?: string
          valuation_date: string
          value_cents?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asset_class?: string
          asset_name?: string
          book_id?: string
          cost_basis_cents?: number
          created_at?: string
          ct_company_id?: string | null
          ct_security_id?: string | null
          id?: string
          methodology?: string
          note?: string | null
          offering_id?: string | null
          ownership_pct?: number | null
          prepared_by?: string | null
          prior_valuation_id?: string | null
          quantity?: number | null
          realized_change_cents?: number
          reviewed_by?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["valuation_status"]
          supporting_document_path?: string | null
          unrealized_change_cents?: number
          updated_at?: string
          valuation_date?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_ct_company_id_fkey"
            columns: ["ct_company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_ct_security_id_fkey"
            columns: ["ct_security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_prior_valuation_id_fkey"
            columns: ["prior_valuation_id"]
            isOneToOne: false
            referencedRelation: "asset_valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_documents: {
        Row: {
          classification: string
          created_at: string
          delegation_id: string
          draft_id: string | null
          id: string
          investor_document_id: string | null
          organization_id: string | null
          original_filename: string
          principal_user_id: string
          resource_id: string
          resource_type: string
          storage_path: string
          uploaded_by_user_id: string
        }
        Insert: {
          classification: string
          created_at?: string
          delegation_id: string
          draft_id?: string | null
          id?: string
          investor_document_id?: string | null
          organization_id?: string | null
          original_filename: string
          principal_user_id: string
          resource_id: string
          resource_type: string
          storage_path: string
          uploaded_by_user_id: string
        }
        Update: {
          classification?: string
          created_at?: string
          delegation_id?: string
          draft_id?: string | null
          id?: string
          investor_document_id?: string | null
          organization_id?: string | null
          original_filename?: string
          principal_user_id?: string
          resource_id?: string
          resource_type?: string
          storage_path?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assisted_documents_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_documents_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "assisted_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_documents_investor_document_id_fkey"
            columns: ["investor_document_id"]
            isOneToOne: false
            referencedRelation: "investor_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_draft_events: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          delegation_id: string | null
          draft_id: string
          from_status: string | null
          id: string
          organization_id: string | null
          payload: Json
          prepared_by_user_id: string
          principal_user_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id?: string | null
          created_at?: string
          delegation_id?: string | null
          draft_id: string
          from_status?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          prepared_by_user_id: string
          principal_user_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          delegation_id?: string | null
          draft_id?: string
          from_status?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          prepared_by_user_id?: string
          principal_user_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assisted_draft_events_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "assisted_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_drafts: {
        Row: {
          applied_at: string | null
          before_state: Json
          client_note: string | null
          created_at: string
          delegation_id: string
          draft_type: Database["public"]["Enums"]["assisted_draft_type"]
          final_state: Json | null
          id: string
          organization_id: string | null
          prepared_by_user_id: string
          preparer_note: string | null
          principal_user_id: string
          proposed_state: Json
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: Database["public"]["Enums"]["assisted_draft_status"]
          target_id: string | null
          target_type: string
          title: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          before_state?: Json
          client_note?: string | null
          created_at?: string
          delegation_id: string
          draft_type: Database["public"]["Enums"]["assisted_draft_type"]
          final_state?: Json | null
          id?: string
          organization_id?: string | null
          prepared_by_user_id: string
          preparer_note?: string | null
          principal_user_id: string
          proposed_state?: Json
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["assisted_draft_status"]
          target_id?: string | null
          target_type: string
          title: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          before_state?: Json
          client_note?: string | null
          created_at?: string
          delegation_id?: string
          draft_type?: Database["public"]["Enums"]["assisted_draft_type"]
          final_state?: Json | null
          id?: string
          organization_id?: string | null
          prepared_by_user_id?: string
          preparer_note?: string | null
          principal_user_id?: string
          proposed_state?: Json
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["assisted_draft_status"]
          target_id?: string | null
          target_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assisted_drafts_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_notifications: {
        Row: {
          created_at: string
          draft_id: string | null
          id: string
          kind: string
          message: string
          principal_user_id: string
          read_at: string | null
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          id?: string
          kind: string
          message: string
          principal_user_id: string
          read_at?: string | null
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          id?: string
          kind?: string
          message?: string
          principal_user_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assisted_notifications_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "assisted_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_documents: {
        Row: {
          covered_actions: string[]
          covered_document_types: string[]
          created_at: string
          delegate_user_id: string
          delegation_id: string | null
          document_hash: string | null
          document_type: string
          effective_at: string
          expires_at: string | null
          file_name: string
          id: string
          organization_id: string | null
          principal_user_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["delegation_scope_type"]
          storage_path: string
          submitted_by: string
          superseded_by: string | null
          updated_at: string
          version: number
        }
        Insert: {
          covered_actions?: string[]
          covered_document_types?: string[]
          created_at?: string
          delegate_user_id: string
          delegation_id?: string | null
          document_hash?: string | null
          document_type: string
          effective_at?: string
          expires_at?: string | null
          file_name: string
          id?: string
          organization_id?: string | null
          principal_user_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string | null
          scope_type: Database["public"]["Enums"]["delegation_scope_type"]
          storage_path: string
          submitted_by: string
          superseded_by?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          covered_actions?: string[]
          covered_document_types?: string[]
          created_at?: string
          delegate_user_id?: string
          delegation_id?: string | null
          document_hash?: string | null
          document_type?: string
          effective_at?: string
          expires_at?: string | null
          file_name?: string
          id?: string
          organization_id?: string | null
          principal_user_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["delegation_scope_type"]
          storage_path?: string
          submitted_by?: string
          superseded_by?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "authority_documents_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_notifications: {
        Row: {
          authority_document_id: string | null
          created_at: string
          delegation_id: string | null
          id: string
          kind: string
          message: string
          organization_id: string | null
          read_at: string | null
          recipient_kind: string
          recipient_user_id: string
        }
        Insert: {
          authority_document_id?: string | null
          created_at?: string
          delegation_id?: string | null
          id?: string
          kind: string
          message: string
          organization_id?: string | null
          read_at?: string | null
          recipient_kind?: string
          recipient_user_id: string
        }
        Update: {
          authority_document_id?: string | null
          created_at?: string
          delegation_id?: string | null
          id?: string
          kind?: string
          message?: string
          organization_id?: string | null
          read_at?: string | null
          recipient_kind?: string
          recipient_user_id?: string
        }
        Relationships: []
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
      bank_reconciliations: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledgement_required: boolean
          approval_required: Database["public"]["Enums"]["reconciliation_approver"]
          approved_by_harmonious: string | null
          auto_matched: boolean
          bank_transaction_id: string
          book_id: string | null
          classified_at: string | null
          confidence: Database["public"]["Enums"]["match_confidence"]
          conflicts: Json
          corrected_at: string | null
          corrected_by: string | null
          correction_reason: string | null
          created_at: string
          external_approved_at: string | null
          external_approver_id: string | null
          harmonious_approved_at: string | null
          id: string
          information_request: string | null
          information_requested_at: string | null
          investment_profile_id: string | null
          investor_user_id: string | null
          journal_entry_id: string | null
          match_confidence: string | null
          match_reasons: Json
          matched_application_id: string | null
          matched_invoice_id: string | null
          matched_payment_id: string | null
          matched_records: Json
          matched_wire_request_id: string | null
          note: string | null
          offering_id: string | null
          posted_at: string | null
          posting_rule_id: string | null
          posting_rule_version: number | null
          reconciled_at: string | null
          reconciled_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_credit_account_id: string | null
          suggested_debit_account_id: string | null
          transaction_type:
            | Database["public"]["Enums"]["cash_transaction_type"]
            | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_required?: boolean
          approval_required?: Database["public"]["Enums"]["reconciliation_approver"]
          approved_by_harmonious?: string | null
          auto_matched?: boolean
          bank_transaction_id: string
          book_id?: string | null
          classified_at?: string | null
          confidence?: Database["public"]["Enums"]["match_confidence"]
          conflicts?: Json
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          external_approved_at?: string | null
          external_approver_id?: string | null
          harmonious_approved_at?: string | null
          id?: string
          information_request?: string | null
          information_requested_at?: string | null
          investment_profile_id?: string | null
          investor_user_id?: string | null
          journal_entry_id?: string | null
          match_confidence?: string | null
          match_reasons?: Json
          matched_application_id?: string | null
          matched_invoice_id?: string | null
          matched_payment_id?: string | null
          matched_records?: Json
          matched_wire_request_id?: string | null
          note?: string | null
          offering_id?: string | null
          posted_at?: string | null
          posting_rule_id?: string | null
          posting_rule_version?: number | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_credit_account_id?: string | null
          suggested_debit_account_id?: string | null
          transaction_type?:
            | Database["public"]["Enums"]["cash_transaction_type"]
            | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_required?: boolean
          approval_required?: Database["public"]["Enums"]["reconciliation_approver"]
          approved_by_harmonious?: string | null
          auto_matched?: boolean
          bank_transaction_id?: string
          book_id?: string | null
          classified_at?: string | null
          confidence?: Database["public"]["Enums"]["match_confidence"]
          conflicts?: Json
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          external_approved_at?: string | null
          external_approver_id?: string | null
          harmonious_approved_at?: string | null
          id?: string
          information_request?: string | null
          information_requested_at?: string | null
          investment_profile_id?: string | null
          investor_user_id?: string | null
          journal_entry_id?: string | null
          match_confidence?: string | null
          match_reasons?: Json
          matched_application_id?: string | null
          matched_invoice_id?: string | null
          matched_payment_id?: string | null
          matched_records?: Json
          matched_wire_request_id?: string | null
          note?: string | null
          offering_id?: string | null
          posted_at?: string | null
          posting_rule_id?: string | null
          posting_rule_version?: number | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_credit_account_id?: string | null
          suggested_debit_account_id?: string | null
          transaction_type?:
            | Database["public"]["Enums"]["cash_transaction_type"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: true
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_matched_application_id_fkey"
            columns: ["matched_application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_matched_wire_request_id_fkey"
            columns: ["matched_wire_request_id"]
            isOneToOne: false
            referencedRelation: "wire_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_posting_rule_id_fkey"
            columns: ["posting_rule_id"]
            isOneToOne: false
            referencedRelation: "posting_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_suggested_credit_account_id_fkey"
            columns: ["suggested_credit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_suggested_debit_account_id_fkey"
            columns: ["suggested_debit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount_cents: number
          auto_matched: boolean
          created_at: string
          dedupe_key: string | null
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
          dedupe_key?: string | null
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
          dedupe_key?: string | null
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
      book_tax_adjustments: {
        Row: {
          account_id: string | null
          adjustment_cents: number
          approved_at: string | null
          approved_by: string | null
          book_amount_cents: number
          category: string
          created_at: string
          difference_type: string
          evidence: Json
          explanation: string
          id: string
          item_code: string
          offering_id: string | null
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          status: string
          tax_amount_cents: number
          tax_year_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          adjustment_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          book_amount_cents?: number
          category: string
          created_at?: string
          difference_type: string
          evidence?: Json
          explanation: string
          id?: string
          item_code: string
          offering_id?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string
          tax_amount_cents?: number
          tax_year_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          adjustment_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          book_amount_cents?: number
          category?: string
          created_at?: string
          difference_type?: string
          evidence?: Json
          explanation?: string
          id?: string
          item_code?: string
          offering_id?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string
          tax_amount_cents?: number
          tax_year_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_tax_adjustments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_tax_adjustments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_tax_adjustments_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
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
      capital_account_adjustments: {
        Row: {
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          classification: string
          created_at: string
          decision_note: string | null
          effective_date: string
          evidence_path: string | null
          id: string
          offering_id: string
          position_id: string
          reason: string
          requested_at: string
          requested_by: string | null
          run_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          classification: string
          created_at?: string
          decision_note?: string | null
          effective_date: string
          evidence_path?: string | null
          id?: string
          offering_id: string
          position_id: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          classification?: string
          created_at?: string
          decision_note?: string | null
          effective_date?: string
          evidence_path?: string | null
          id?: string
          offering_id?: string
          position_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_account_adjustments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_account_adjustments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_account_adjustments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
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
      capital_accounts: {
        Row: {
          allocated_income_cents: number
          allocated_loss_cents: number
          allocation_inputs: Json
          allocation_method: string
          allocation_run_id: string | null
          application_id: string | null
          approved_by: string | null
          beginning_capital_cents: number
          book_id: string
          carried_interest_cents: number
          class_id: string | null
          commitment_cents: number
          contributed_to_date_cents: number
          contributions_cents: number
          created_at: string
          distributions_cents: number
          distributions_to_date_cents: number
          ending_capital_cents: number
          finalized_at: string | null
          finalized_by: string | null
          fund_expenses_cents: number
          generated_at: string
          generated_by: string | null
          id: string
          investment_profile_id: string | null
          investor_user_id: string | null
          management_fees_cents: number
          nav_version_id: string | null
          offering_id: string | null
          other_adjustments_cents: number
          ownership_pct: number | null
          period_end: string
          period_id: string | null
          period_start: string
          position_id: string | null
          published_at: string | null
          published_by: string | null
          realized_gain_cents: number
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          supersedes_id: string | null
          tax_allocations: Json
          unfunded_commitment_cents: number
          units: number | null
          unrealized_gain_cents: number
          updated_at: string
          version: number
        }
        Insert: {
          allocated_income_cents?: number
          allocated_loss_cents?: number
          allocation_inputs?: Json
          allocation_method?: string
          allocation_run_id?: string | null
          application_id?: string | null
          approved_by?: string | null
          beginning_capital_cents?: number
          book_id: string
          carried_interest_cents?: number
          class_id?: string | null
          commitment_cents?: number
          contributed_to_date_cents?: number
          contributions_cents?: number
          created_at?: string
          distributions_cents?: number
          distributions_to_date_cents?: number
          ending_capital_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          fund_expenses_cents?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          management_fees_cents?: number
          nav_version_id?: string | null
          offering_id?: string | null
          other_adjustments_cents?: number
          ownership_pct?: number | null
          period_end: string
          period_id?: string | null
          period_start: string
          position_id?: string | null
          published_at?: string | null
          published_by?: string | null
          realized_gain_cents?: number
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          supersedes_id?: string | null
          tax_allocations?: Json
          unfunded_commitment_cents?: number
          units?: number | null
          unrealized_gain_cents?: number
          updated_at?: string
          version?: number
        }
        Update: {
          allocated_income_cents?: number
          allocated_loss_cents?: number
          allocation_inputs?: Json
          allocation_method?: string
          allocation_run_id?: string | null
          application_id?: string | null
          approved_by?: string | null
          beginning_capital_cents?: number
          book_id?: string
          carried_interest_cents?: number
          class_id?: string | null
          commitment_cents?: number
          contributed_to_date_cents?: number
          contributions_cents?: number
          created_at?: string
          distributions_cents?: number
          distributions_to_date_cents?: number
          ending_capital_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          fund_expenses_cents?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          management_fees_cents?: number
          nav_version_id?: string | null
          offering_id?: string | null
          other_adjustments_cents?: number
          ownership_pct?: number | null
          period_end?: string
          period_id?: string | null
          period_start?: string
          position_id?: string | null
          published_at?: string | null
          published_by?: string | null
          realized_gain_cents?: number
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          supersedes_id?: string | null
          tax_allocations?: Json
          unfunded_commitment_cents?: number
          units?: number | null
          unrealized_gain_cents?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "capital_accounts_allocation_run_id_fkey"
            columns: ["allocation_run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "investor_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_accounts_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "capital_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      carry_allocations: {
        Row: {
          amount_cents: number
          approved_by: string | null
          clawback_cents: number
          created_at: string
          id: string
          inputs: Json
          offering_id: string
          position_id: string | null
          run_id: string | null
          source: string
          terms_id: string | null
          tier: string | null
        }
        Insert: {
          amount_cents?: number
          approved_by?: string | null
          clawback_cents?: number
          created_at?: string
          id?: string
          inputs?: Json
          offering_id: string
          position_id?: string | null
          run_id?: string | null
          source?: string
          terms_id?: string | null
          tier?: string | null
        }
        Update: {
          amount_cents?: number
          approved_by?: string | null
          clawback_cents?: number
          created_at?: string
          id?: string
          inputs?: Json
          offering_id?: string
          position_id?: string | null
          run_id?: string | null
          source?: string
          terms_id?: string | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carry_allocations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carry_allocations_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carry_allocations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carry_allocations_terms_id_fkey"
            columns: ["terms_id"]
            isOneToOne: false
            referencedRelation: "waterfall_terms"
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
      chart_of_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["ledger_account_type"]
          book_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          normal_balance: string
          parent_account_id: string | null
          subtype: string
          updated_at: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["ledger_account_type"]
          book_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          normal_balance?: string
          parent_account_id?: string | null
          subtype?: string
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["ledger_account_type"]
          book_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          normal_balance?: string
          parent_account_id?: string | null
          subtype?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
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
      close_checklist_items: {
        Row: {
          blocking: boolean
          book_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          detail: Json
          id: string
          item_key: string
          label: string
          offering_id: string | null
          period_end: string
          period_id: string | null
          status: string
          updated_at: string
          waived_by: string | null
          waived_reason: string | null
        }
        Insert: {
          blocking?: boolean
          book_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          detail?: Json
          id?: string
          item_key: string
          label: string
          offering_id?: string | null
          period_end: string
          period_id?: string | null
          status?: string
          updated_at?: string
          waived_by?: string | null
          waived_reason?: string | null
        }
        Update: {
          blocking?: boolean
          book_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          detail?: Json
          id?: string
          item_key?: string
          label?: string
          offering_id?: string | null
          period_end?: string
          period_id?: string | null
          status?: string
          updated_at?: string
          waived_by?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "close_checklist_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_checklist_items_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_checklist_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
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
      commitment_events: {
        Row: {
          amount_cents: number
          created_at: string
          dedupe_key: string | null
          effective_date: string
          event_type: string
          evidence_path: string | null
          id: string
          journal_entry_id: string | null
          offering_id: string
          payment_id: string | null
          position_id: string
          reason: string | null
          recorded_by: string | null
          source: string
          source_ref: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          dedupe_key?: string | null
          effective_date: string
          event_type: string
          evidence_path?: string | null
          id?: string
          journal_entry_id?: string | null
          offering_id: string
          payment_id?: string | null
          position_id: string
          reason?: string | null
          recorded_by?: string | null
          source: string
          source_ref?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          dedupe_key?: string | null
          effective_date?: string
          event_type?: string
          evidence_path?: string | null
          id?: string
          journal_entry_id?: string | null
          offering_id?: string
          payment_id?: string | null
          position_id?: string
          reason?: string | null
          recorded_by?: string | null
          source?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commitment_events_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_events_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
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
      delegated_signatures: {
        Row: {
          authority_document_id: string
          authority_level: Database["public"]["Enums"]["delegation_authority_level"]
          delegation_id: string
          document_hash: string
          document_name: string | null
          document_reference: string | null
          document_type: string
          fund_id: string | null
          id: string
          investment_id: string | null
          ip_address: string | null
          organization_id: string | null
          organization_name: string | null
          principal_name: string | null
          principal_user_id: string
          profile_id: string | null
          profile_label: string | null
          signature_statement: string
          signed_at: string
          signer_name: string
          signer_title: string | null
          signer_user_id: string
          stepup_id: string
          stepup_method: string
          user_agent: string | null
        }
        Insert: {
          authority_document_id: string
          authority_level: Database["public"]["Enums"]["delegation_authority_level"]
          delegation_id: string
          document_hash: string
          document_name?: string | null
          document_reference?: string | null
          document_type: string
          fund_id?: string | null
          id?: string
          investment_id?: string | null
          ip_address?: string | null
          organization_id?: string | null
          organization_name?: string | null
          principal_name?: string | null
          principal_user_id: string
          profile_id?: string | null
          profile_label?: string | null
          signature_statement: string
          signed_at?: string
          signer_name: string
          signer_title?: string | null
          signer_user_id: string
          stepup_id: string
          stepup_method: string
          user_agent?: string | null
        }
        Update: {
          authority_document_id?: string
          authority_level?: Database["public"]["Enums"]["delegation_authority_level"]
          delegation_id?: string
          document_hash?: string
          document_name?: string | null
          document_reference?: string | null
          document_type?: string
          fund_id?: string | null
          id?: string
          investment_id?: string | null
          ip_address?: string | null
          organization_id?: string | null
          organization_name?: string | null
          principal_name?: string | null
          principal_user_id?: string
          profile_id?: string | null
          profile_label?: string | null
          signature_statement?: string
          signed_at?: string
          signer_name?: string
          signer_title?: string | null
          signer_user_id?: string
          stepup_id?: string
          stepup_method?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      delegation_acceptance_events: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string
          authority_level:
            | Database["public"]["Enums"]["delegation_authority_level"]
            | null
          capabilities: string[]
          created_at: string
          delegate_user_id: string
          delegation_id: string
          effective_at: string | null
          expires_at: string | null
          grant_version: number
          id: string
          organization_id: string | null
          principal_user_id: string
          scope_id: string | null
          scope_type:
            | Database["public"]["Enums"]["delegation_scope_type"]
            | null
          snapshot: Json
          terms_version: string | null
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id: string
          authority_level?:
            | Database["public"]["Enums"]["delegation_authority_level"]
            | null
          capabilities?: string[]
          created_at?: string
          delegate_user_id: string
          delegation_id: string
          effective_at?: string | null
          expires_at?: string | null
          grant_version?: number
          id?: string
          organization_id?: string | null
          principal_user_id: string
          scope_id?: string | null
          scope_type?:
            | Database["public"]["Enums"]["delegation_scope_type"]
            | null
          snapshot?: Json
          terms_version?: string | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string
          authority_level?:
            | Database["public"]["Enums"]["delegation_authority_level"]
            | null
          capabilities?: string[]
          created_at?: string
          delegate_user_id?: string
          delegation_id?: string
          effective_at?: string | null
          expires_at?: string | null
          grant_version?: number
          id?: string
          organization_id?: string | null
          principal_user_id?: string
          scope_id?: string | null
          scope_type?:
            | Database["public"]["Enums"]["delegation_scope_type"]
            | null
          snapshot?: Json
          terms_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delegation_acceptance_events_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
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
          acceptance_state: string
          accepted_at: string | null
          accepted_by: string | null
          accepted_terms_version: string | null
          authority_document_name: string | null
          authority_document_path: string | null
          authority_level: Database["public"]["Enums"]["delegation_authority_level"]
          covered_document_types: string[]
          created_at: string
          data_category: string | null
          delegate_user_id: string
          effective_at: string
          expires_at: string | null
          grant_version: number
          granted_by: string
          id: string
          last_used_at: string | null
          material_change_at: string | null
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
          acceptance_state?: string
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_terms_version?: string | null
          authority_document_name?: string | null
          authority_document_path?: string | null
          authority_level?: Database["public"]["Enums"]["delegation_authority_level"]
          covered_document_types?: string[]
          created_at?: string
          data_category?: string | null
          delegate_user_id: string
          effective_at?: string
          expires_at?: string | null
          grant_version?: number
          granted_by: string
          id?: string
          last_used_at?: string | null
          material_change_at?: string | null
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
          acceptance_state?: string
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_terms_version?: string | null
          authority_document_name?: string | null
          authority_document_path?: string | null
          authority_level?: Database["public"]["Enums"]["delegation_authority_level"]
          covered_document_types?: string[]
          created_at?: string
          data_category?: string | null
          delegate_user_id?: string
          effective_at?: string
          expires_at?: string | null
          grant_version?: number
          granted_by?: string
          id?: string
          last_used_at?: string | null
          material_change_at?: string | null
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
      entity_verifications: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          beneficial_ownership: Json
          city: string | null
          country: string | null
          created_at: string
          entity_aml_status: Database["public"]["Enums"]["check_status"]
          entity_type: string | null
          expires_at: string | null
          formation_date: string | null
          formation_documents: Json
          formation_jurisdiction: string | null
          id: string
          kyb_status: Database["public"]["Enums"]["check_status"]
          legal_name: string | null
          postal_code: string | null
          profile_id: string
          region: string | null
          review_notes: string | null
          reviewer_id: string | null
          screened_at: string | null
          submitted_at: string | null
          tax_id_last4: string | null
          tax_id_reference: string | null
          trust_date: string | null
          trust_type: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          beneficial_ownership?: Json
          city?: string | null
          country?: string | null
          created_at?: string
          entity_aml_status?: Database["public"]["Enums"]["check_status"]
          entity_type?: string | null
          expires_at?: string | null
          formation_date?: string | null
          formation_documents?: Json
          formation_jurisdiction?: string | null
          id?: string
          kyb_status?: Database["public"]["Enums"]["check_status"]
          legal_name?: string | null
          postal_code?: string | null
          profile_id: string
          region?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          screened_at?: string | null
          submitted_at?: string | null
          tax_id_last4?: string | null
          tax_id_reference?: string | null
          trust_date?: string | null
          trust_type?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          beneficial_ownership?: Json
          city?: string | null
          country?: string | null
          created_at?: string
          entity_aml_status?: Database["public"]["Enums"]["check_status"]
          entity_type?: string | null
          expires_at?: string | null
          formation_date?: string | null
          formation_documents?: Json
          formation_jurisdiction?: string | null
          id?: string
          kyb_status?: Database["public"]["Enums"]["check_status"]
          legal_name?: string | null
          postal_code?: string | null
          profile_id?: string
          region?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          screened_at?: string | null
          submitted_at?: string | null
          tax_id_last4?: string | null
          tax_id_reference?: string | null
          trust_date?: string | null
          trust_type?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_calculations: {
        Row: {
          basis: string
          basis_amount_cents: number
          created_at: string
          gross_fee_cents: number
          id: string
          inputs: Json
          ledger_fee_cents: number | null
          net_fee_cents: number
          offering_id: string
          offset_cents: number
          period_end: string
          period_start: string
          position_id: string | null
          rate_bps: number
          reconciled: boolean
          run_id: string | null
          term_id: string | null
          waiver_cents: number
        }
        Insert: {
          basis: string
          basis_amount_cents?: number
          created_at?: string
          gross_fee_cents?: number
          id?: string
          inputs?: Json
          ledger_fee_cents?: number | null
          net_fee_cents?: number
          offering_id: string
          offset_cents?: number
          period_end: string
          period_start: string
          position_id?: string | null
          rate_bps?: number
          reconciled?: boolean
          run_id?: string | null
          term_id?: string | null
          waiver_cents?: number
        }
        Update: {
          basis?: string
          basis_amount_cents?: number
          created_at?: string
          gross_fee_cents?: number
          id?: string
          inputs?: Json
          ledger_fee_cents?: number | null
          net_fee_cents?: number
          offering_id?: string
          offset_cents?: number
          period_end?: string
          period_start?: string
          position_id?: string | null
          rate_bps?: number
          reconciled?: boolean
          run_id?: string | null
          term_id?: string | null
          waiver_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_calculations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_calculations_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_calculations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_calculations_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "management_fee_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          accounting_snapshot: Json
          allocation_run_id: string | null
          approved_at: string | null
          approved_by: string | null
          basis: string
          book_id: string | null
          client_entity_id: string | null
          close_snapshot: Json
          comparatives: Json
          created_at: string
          ct_company_id: string | null
          ct_stakeholder_id: string | null
          domain: Database["public"]["Enums"]["report_domain"]
          exceptions: Json
          generated_at: string
          generated_by: string | null
          gl_cutoff_at: string | null
          id: string
          investor_visible: boolean
          manager_note: string | null
          manager_responded_at: string | null
          manager_responded_by: string | null
          manager_response: string | null
          manager_visible: boolean
          mapping_version: number | null
          mapping_version_id: string | null
          methodology_version: string
          nav_version_id: string | null
          offering_id: string | null
          package_run_id: string | null
          payload: Json
          period_end: string | null
          period_id: string | null
          period_start: string | null
          prepared_at: string | null
          prepared_by: string | null
          published_at: string | null
          published_by: string | null
          reconciliations: Json
          report_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision_reason: string | null
          source_cutoff_at: string
          status: Database["public"]["Enums"]["report_status"]
          storage_path: string | null
          subject_profile_id: string | null
          subject_user_id: string | null
          superseded_by_id: string | null
          supersedes_id: string | null
          updated_at: string
          valuation_versions: Json
          version: number
        }
        Insert: {
          accounting_snapshot?: Json
          allocation_run_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          basis?: string
          book_id?: string | null
          client_entity_id?: string | null
          close_snapshot?: Json
          comparatives?: Json
          created_at?: string
          ct_company_id?: string | null
          ct_stakeholder_id?: string | null
          domain?: Database["public"]["Enums"]["report_domain"]
          exceptions?: Json
          generated_at?: string
          generated_by?: string | null
          gl_cutoff_at?: string | null
          id?: string
          investor_visible?: boolean
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          manager_visible?: boolean
          mapping_version?: number | null
          mapping_version_id?: string | null
          methodology_version?: string
          nav_version_id?: string | null
          offering_id?: string | null
          package_run_id?: string | null
          payload?: Json
          period_end?: string | null
          period_id?: string | null
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          reconciliations?: Json
          report_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_reason?: string | null
          source_cutoff_at?: string
          status?: Database["public"]["Enums"]["report_status"]
          storage_path?: string | null
          subject_profile_id?: string | null
          subject_user_id?: string | null
          superseded_by_id?: string | null
          supersedes_id?: string | null
          updated_at?: string
          valuation_versions?: Json
          version?: number
        }
        Update: {
          accounting_snapshot?: Json
          allocation_run_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          basis?: string
          book_id?: string | null
          client_entity_id?: string | null
          close_snapshot?: Json
          comparatives?: Json
          created_at?: string
          ct_company_id?: string | null
          ct_stakeholder_id?: string | null
          domain?: Database["public"]["Enums"]["report_domain"]
          exceptions?: Json
          generated_at?: string
          generated_by?: string | null
          gl_cutoff_at?: string | null
          id?: string
          investor_visible?: boolean
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          manager_visible?: boolean
          mapping_version?: number | null
          mapping_version_id?: string | null
          methodology_version?: string
          nav_version_id?: string | null
          offering_id?: string | null
          package_run_id?: string | null
          payload?: Json
          period_end?: string | null
          period_id?: string | null
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          reconciliations?: Json
          report_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_reason?: string | null
          source_cutoff_at?: string
          status?: Database["public"]["Enums"]["report_status"]
          storage_path?: string | null
          subject_profile_id?: string | null
          subject_user_id?: string | null
          superseded_by_id?: string | null
          supersedes_id?: string | null
          updated_at?: string
          valuation_versions?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_allocation_run_id_fkey"
            columns: ["allocation_run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_client_entity_id_fkey"
            columns: ["client_entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_ct_company_id_fkey"
            columns: ["ct_company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_ct_stakeholder_id_fkey"
            columns: ["ct_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ct_stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_mapping_version_id_fkey"
            columns: ["mapping_version_id"]
            isOneToOne: false
            referencedRelation: "statement_mapping_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_package_run_id_fkey"
            columns: ["package_run_id"]
            isOneToOne: false
            referencedRelation: "report_package_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_subject_profile_id_fkey"
            columns: ["subject_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      form_1042_returns: {
        Row: {
          approved_by: string | null
          control_totals: Json
          created_at: string
          difference_cents: number
          exceptions: Json
          filing_status: string
          id: string
          offering_id: string
          prepared_by: string | null
          recipient_totals: Json
          reviewed_by: string | null
          source_manifest: Json
          status: string
          supersedes_id: string | null
          tax_year: number
          tax_year_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approved_by?: string | null
          control_totals?: Json
          created_at?: string
          difference_cents?: number
          exceptions?: Json
          filing_status?: string
          id?: string
          offering_id: string
          prepared_by?: string | null
          recipient_totals?: Json
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_year: number
          tax_year_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approved_by?: string | null
          control_totals?: Json
          created_at?: string
          difference_cents?: number
          exceptions?: Json
          filing_status?: string
          id?: string
          offering_id?: string
          prepared_by?: string | null
          recipient_totals?: Json
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_year?: number
          tax_year_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_1042_returns_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1042_returns_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "form_1042_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1042_returns_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
            referencedColumns: ["id"]
          },
        ]
      }
      form_1042s_records: {
        Row: {
          amendment_reason: string | null
          approved_by: string | null
          chapter: string
          country: string | null
          created_at: string
          delivered_at: string | null
          exemption_code: string | null
          gross_income_cents: number
          id: string
          income_code: string
          investment_profile_id: string | null
          offering_id: string
          prepared_by: string | null
          rate_bps: number
          recipient_user_id: string | null
          reviewed_by: string | null
          source_manifest: Json
          status: string
          supersedes_id: string | null
          tax_year: number
          tax_year_id: string | null
          updated_at: string
          version: number
          withheld_cents: number
          withholding_record_ids: Json
        }
        Insert: {
          amendment_reason?: string | null
          approved_by?: string | null
          chapter?: string
          country?: string | null
          created_at?: string
          delivered_at?: string | null
          exemption_code?: string | null
          gross_income_cents?: number
          id?: string
          income_code: string
          investment_profile_id?: string | null
          offering_id: string
          prepared_by?: string | null
          rate_bps?: number
          recipient_user_id?: string | null
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_year: number
          tax_year_id?: string | null
          updated_at?: string
          version?: number
          withheld_cents?: number
          withholding_record_ids?: Json
        }
        Update: {
          amendment_reason?: string | null
          approved_by?: string | null
          chapter?: string
          country?: string | null
          created_at?: string
          delivered_at?: string | null
          exemption_code?: string | null
          gross_income_cents?: number
          id?: string
          income_code?: string
          investment_profile_id?: string | null
          offering_id?: string
          prepared_by?: string | null
          rate_bps?: number
          recipient_user_id?: string | null
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_year?: number
          tax_year_id?: string | null
          updated_at?: string
          version?: number
          withheld_cents?: number
          withholding_record_ids?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_1042s_records_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1042s_records_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1042s_records_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "form_1042s_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1042s_records_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
            referencedColumns: ["id"]
          },
        ]
      }
      form_1099_records: {
        Row: {
          approved_by: string | null
          boxes: Json
          correction_reason: string | null
          corrects_id: string | null
          created_at: string
          delivered_at: string | null
          exceptions: Json
          filing_status: string
          form_type: string
          id: string
          is_correction: boolean
          offering_id: string | null
          payer_entity_id: string | null
          payer_name: string
          payment_record_ids: Json
          prepared_by: string | null
          recipient_classification: string | null
          recipient_name: string
          recipient_profile_id: string | null
          recipient_user_id: string | null
          reviewed_by: string | null
          source_manifest: Json
          status: string
          tax_year: number
          tax_year_id: string | null
          tin_on_file: boolean
          total_amount_cents: number
          updated_at: string
          version: number
          withheld_cents: number
        }
        Insert: {
          approved_by?: string | null
          boxes?: Json
          correction_reason?: string | null
          corrects_id?: string | null
          created_at?: string
          delivered_at?: string | null
          exceptions?: Json
          filing_status?: string
          form_type: string
          id?: string
          is_correction?: boolean
          offering_id?: string | null
          payer_entity_id?: string | null
          payer_name: string
          payment_record_ids?: Json
          prepared_by?: string | null
          recipient_classification?: string | null
          recipient_name: string
          recipient_profile_id?: string | null
          recipient_user_id?: string | null
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          tax_year: number
          tax_year_id?: string | null
          tin_on_file?: boolean
          total_amount_cents?: number
          updated_at?: string
          version?: number
          withheld_cents?: number
        }
        Update: {
          approved_by?: string | null
          boxes?: Json
          correction_reason?: string | null
          corrects_id?: string | null
          created_at?: string
          delivered_at?: string | null
          exceptions?: Json
          filing_status?: string
          form_type?: string
          id?: string
          is_correction?: boolean
          offering_id?: string | null
          payer_entity_id?: string | null
          payer_name?: string
          payment_record_ids?: Json
          prepared_by?: string | null
          recipient_classification?: string | null
          recipient_name?: string
          recipient_profile_id?: string | null
          recipient_user_id?: string | null
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          tax_year?: number
          tax_year_id?: string | null
          tin_on_file?: boolean
          total_amount_cents?: number
          updated_at?: string
          version?: number
          withheld_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_1099_records_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "form_1099_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1099_records_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1099_records_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_1099_records_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
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
      fund_banking_setups: {
        Row: {
          account_active_at: string | null
          account_reference: string | null
          application_submitted_at: string | null
          approved_at: string | null
          bank_name: string | null
          created_at: string
          id: string
          investor_instructions_released: boolean
          investor_instructions_released_at: string | null
          investor_instructions_released_by: string | null
          notes: string | null
          relationship_contact: string | null
          setup_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_active_at?: string | null
          account_reference?: string | null
          application_submitted_at?: string | null
          approved_at?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          investor_instructions_released?: boolean
          investor_instructions_released_at?: string | null
          investor_instructions_released_by?: string | null
          notes?: string | null
          relationship_contact?: string | null
          setup_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_active_at?: string | null
          account_reference?: string | null
          application_submitted_at?: string | null
          approved_at?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          investor_instructions_released?: boolean
          investor_instructions_released_at?: string | null
          investor_instructions_released_by?: string | null
          notes?: string | null
          relationship_contact?: string | null
          setup_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_banking_setups_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: true
            referencedRelation: "fund_setups"
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
      fund_economics_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          change_reason: string | null
          classes: Json
          created_at: string
          effective_from: string | null
          id: string
          investor_specific: Json
          prepared_by: string | null
          setup_id: string
          status: string
          supersedes_id: string | null
          terms: Json
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          classes?: Json
          created_at?: string
          effective_from?: string | null
          id?: string
          investor_specific?: Json
          prepared_by?: string | null
          setup_id: string
          status?: string
          supersedes_id?: string | null
          terms?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          classes?: Json
          created_at?: string
          effective_from?: string | null
          id?: string
          investor_specific?: Json
          prepared_by?: string | null
          setup_id?: string
          status?: string
          supersedes_id?: string | null
          terms?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fund_economics_versions_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_economics_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "fund_economics_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_eligibility_configs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          rules: Json
          setup_id: string
          status: string
          supersedes_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rules?: Json
          setup_id: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rules?: Json
          setup_id?: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fund_eligibility_configs_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_eligibility_configs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "fund_eligibility_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_entity_formation: {
        Row: {
          certificate_document_id: string | null
          created_at: string
          ein_letter_document_id: string | null
          ein_received_at: string | null
          ein_requested_at: string | null
          entity_active_at: string | null
          entity_identifiers: Json
          formation_accepted_at: string | null
          formation_document_id: string | null
          formation_filed_at: string | null
          formation_requested_at: string | null
          id: string
          jurisdiction: string | null
          notes: string | null
          registered_agent: string | null
          registered_agent_confirmed_at: string | null
          setup_id: string
          step: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          certificate_document_id?: string | null
          created_at?: string
          ein_letter_document_id?: string | null
          ein_received_at?: string | null
          ein_requested_at?: string | null
          entity_active_at?: string | null
          entity_identifiers?: Json
          formation_accepted_at?: string | null
          formation_document_id?: string | null
          formation_filed_at?: string | null
          formation_requested_at?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          registered_agent?: string | null
          registered_agent_confirmed_at?: string | null
          setup_id: string
          step?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certificate_document_id?: string | null
          created_at?: string
          ein_letter_document_id?: string | null
          ein_received_at?: string | null
          ein_requested_at?: string | null
          entity_active_at?: string | null
          entity_identifiers?: Json
          formation_accepted_at?: string | null
          formation_document_id?: string | null
          formation_filed_at?: string | null
          formation_requested_at?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          registered_agent?: string | null
          registered_agent_confirmed_at?: string | null
          setup_id?: string
          step?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_entity_formation_certificate_document_id_fkey"
            columns: ["certificate_document_id"]
            isOneToOne: false
            referencedRelation: "fund_setup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_entity_formation_ein_letter_document_id_fkey"
            columns: ["ein_letter_document_id"]
            isOneToOne: false
            referencedRelation: "fund_setup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_entity_formation_formation_document_id_fkey"
            columns: ["formation_document_id"]
            isOneToOne: false
            referencedRelation: "fund_setup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_entity_formation_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: true
            referencedRelation: "fund_setups"
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
          intended_amount_cents: number | null
          invitation_source: string | null
          invite_role: Database["public"]["Enums"]["invitation_role"]
          invited_by: string | null
          invited_name: string | null
          last_sent_at: string | null
          offering_id: string
          onboarding_status: string | null
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
          intended_amount_cents?: number | null
          invitation_source?: string | null
          invite_role?: Database["public"]["Enums"]["invitation_role"]
          invited_by?: string | null
          invited_name?: string | null
          last_sent_at?: string | null
          offering_id: string
          onboarding_status?: string | null
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
          intended_amount_cents?: number | null
          invitation_source?: string | null
          invite_role?: Database["public"]["Enums"]["invitation_role"]
          invited_by?: string | null
          invited_name?: string | null
          last_sent_at?: string | null
          offering_id?: string
          onboarding_status?: string | null
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
      fund_launch_approvals: {
        Row: {
          decided_at: string
          decided_by: string
          decision: string
          id: string
          reason: string | null
          setup_id: string
          unmet_conditions: Json
        }
        Insert: {
          decided_at?: string
          decided_by: string
          decision: string
          id?: string
          reason?: string | null
          setup_id: string
          unmet_conditions?: Json
        }
        Update: {
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          reason?: string | null
          setup_id?: string
          unmet_conditions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fund_launch_approvals_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_launch_conditions: {
        Row: {
          condition_key: string
          created_at: string
          evidence: Json
          id: string
          label: string
          required: boolean
          satisfied: boolean
          satisfied_at: string | null
          setup_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          condition_key: string
          created_at?: string
          evidence?: Json
          id?: string
          label: string
          required?: boolean
          satisfied?: boolean
          satisfied_at?: string | null
          setup_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          condition_key?: string
          created_at?: string
          evidence?: Json
          id?: string
          label?: string
          required?: boolean
          satisfied?: boolean
          satisfied_at?: string | null
          setup_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_launch_conditions_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
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
      fund_onboarding_requirements: {
        Row: {
          config: Json
          created_at: string
          id: string
          investor_type: string
          required: boolean
          setup_id: string
          sort_order: number
          step: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          investor_type?: string
          required?: boolean
          setup_id: string
          sort_order?: number
          step: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          investor_type?: string
          required?: boolean
          setup_id?: string
          sort_order?: number
          step?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_onboarding_requirements_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_regulatory_configs: {
        Row: {
          amendment_reason: string | null
          created_at: string
          created_by: string | null
          id: string
          locked_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selections: Json
          setup_id: string
          status: string
          supersedes_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          amendment_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selections?: Json
          setup_id: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          amendment_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selections?: Json
          setup_id?: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fund_regulatory_configs_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_regulatory_configs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "fund_regulatory_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_reporting_policies: {
        Row: {
          administrator_attribution: string
          branding: Json
          contact: Json
          created_at: string
          id: string
          manager_review_enabled: boolean
          offering_id: string
          portfolio_columns: Json
          portfolio_visibility: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          administrator_attribution?: string
          branding?: Json
          contact?: Json
          created_at?: string
          id?: string
          manager_review_enabled?: boolean
          offering_id: string
          portfolio_columns?: Json
          portfolio_visibility?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          administrator_attribution?: string
          branding?: Json
          contact?: Json
          created_at?: string
          id?: string
          manager_review_enabled?: boolean
          offering_id?: string
          portfolio_columns?: Json
          portfolio_visibility?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_reporting_policies_offering_id_fkey"
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
      fund_setup_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          doc_type: string
          external_reference: string | null
          id: string
          investor_facing: boolean
          is_current: boolean
          notes: string | null
          setup_id: string
          status: string
          storage_path: string | null
          supersedes_id: string | null
          task_id: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          uploaded_role: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          doc_type: string
          external_reference?: string | null
          id?: string
          investor_facing?: boolean
          is_current?: boolean
          notes?: string | null
          setup_id: string
          status?: string
          storage_path?: string | null
          supersedes_id?: string | null
          task_id?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_role?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          doc_type?: string
          external_reference?: string | null
          id?: string
          investor_facing?: boolean
          is_current?: boolean
          notes?: string | null
          setup_id?: string
          status?: string
          storage_path?: string | null
          supersedes_id?: string | null
          task_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_role?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fund_setup_documents_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_setup_documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "fund_setup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_setup_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "fund_setup_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_setup_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          detail: Json
          event: string
          from_status: string | null
          id: string
          setup_id: string | null
          subject_id: string | null
          subject_table: string
          to_status: string | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          from_status?: string | null
          id?: string
          setup_id?: string | null
          subject_id?: string | null
          subject_table: string
          to_status?: string | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          from_status?: string | null
          id?: string
          setup_id?: string | null
          subject_id?: string | null
          subject_table?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_setup_events_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_setup_parties: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          display_name: string
          entity_id: string | null
          id: string
          is_authorized_signatory: boolean
          notes: string | null
          organization_id: string | null
          person_id: string | null
          role: string
          setup_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          entity_id?: string | null
          id?: string
          is_authorized_signatory?: boolean
          notes?: string | null
          organization_id?: string | null
          person_id?: string | null
          role: string
          setup_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          entity_id?: string | null
          id?: string
          is_authorized_signatory?: boolean
          notes?: string | null
          organization_id?: string | null
          person_id?: string | null
          role?: string
          setup_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_setup_parties_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_setup_tasks: {
        Row: {
          assigned_user_id: string | null
          blocking: boolean
          client_editable: boolean
          client_owner_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          dependencies: string[]
          description: string | null
          due_date: string | null
          id: string
          label: string
          notes: string | null
          response: Json
          responsible_party: string
          section: string
          setup_id: string
          sort_order: number
          status: string
          task_key: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          blocking?: boolean
          client_editable?: boolean
          client_owner_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          dependencies?: string[]
          description?: string | null
          due_date?: string | null
          id?: string
          label: string
          notes?: string | null
          response?: Json
          responsible_party?: string
          section: string
          setup_id: string
          sort_order?: number
          status?: string
          task_key: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          blocking?: boolean
          client_editable?: boolean
          client_owner_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          dependencies?: string[]
          description?: string | null
          due_date?: string | null
          id?: string
          label?: string
          notes?: string | null
          response?: Json
          responsible_party?: string
          section?: string
          setup_id?: string
          sort_order?: number
          status?: string
          task_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_setup_tasks_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_setups: {
        Row: {
          base_currency: string
          client_id: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          domicile: string | null
          entity_type: string | null
          extension_terms: string | null
          final_close: string | null
          fiscal_year_end: string | null
          formation_date: string | null
          fund_request_id: string | null
          fund_term_months: number | null
          hard_cap_cents: number | null
          id: string
          investment_period_months: number | null
          investment_strategy: string | null
          investor_onboarding_url: string | null
          launch_approved_at: string | null
          launch_approved_by: string | null
          launch_state: string
          launched_at: string | null
          legal_fund_name: string | null
          min_investment_cents: number | null
          notes: string | null
          offering_id: string
          regulatory_structure: string | null
          series_designation: string | null
          series_parent_id: string | null
          stage: string
          structure: string
          structure_other: string | null
          target_close: string | null
          target_size_cents: number | null
          tax_year: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          domicile?: string | null
          entity_type?: string | null
          extension_terms?: string | null
          final_close?: string | null
          fiscal_year_end?: string | null
          formation_date?: string | null
          fund_request_id?: string | null
          fund_term_months?: number | null
          hard_cap_cents?: number | null
          id?: string
          investment_period_months?: number | null
          investment_strategy?: string | null
          investor_onboarding_url?: string | null
          launch_approved_at?: string | null
          launch_approved_by?: string | null
          launch_state?: string
          launched_at?: string | null
          legal_fund_name?: string | null
          min_investment_cents?: number | null
          notes?: string | null
          offering_id: string
          regulatory_structure?: string | null
          series_designation?: string | null
          series_parent_id?: string | null
          stage?: string
          structure?: string
          structure_other?: string | null
          target_close?: string | null
          target_size_cents?: number | null
          tax_year?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          domicile?: string | null
          entity_type?: string | null
          extension_terms?: string | null
          final_close?: string | null
          fiscal_year_end?: string | null
          formation_date?: string | null
          fund_request_id?: string | null
          fund_term_months?: number | null
          hard_cap_cents?: number | null
          id?: string
          investment_period_months?: number | null
          investment_strategy?: string | null
          investor_onboarding_url?: string | null
          launch_approved_at?: string | null
          launch_approved_by?: string | null
          launch_state?: string
          launched_at?: string | null
          legal_fund_name?: string | null
          min_investment_cents?: number | null
          notes?: string | null
          offering_id?: string
          regulatory_structure?: string | null
          series_designation?: string | null
          series_parent_id?: string | null
          stage?: string
          structure?: string
          structure_other?: string | null
          target_close?: string | null
          target_size_cents?: number | null
          tax_year?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_setups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_setups_fund_request_id_fkey"
            columns: ["fund_request_id"]
            isOneToOne: false
            referencedRelation: "fund_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_setups_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_setups_series_parent_id_fkey"
            columns: ["series_parent_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_target_assets: {
        Row: {
          asset_name: string
          closing_date: string | null
          created_at: string
          created_by: string | null
          id: string
          investment_terms: Json
          issuer_approval_status: string
          issuer_name: string | null
          notes: string | null
          price_per_unit_cents: number | null
          purchase_agreement_document_id: string | null
          purchase_amount_cents: number | null
          round_name: string | null
          security_type: string | null
          setup_id: string
          transfer_restrictions: string | null
          unit_count: number | null
          updated_at: string
          valuation_cents: number | null
        }
        Insert: {
          asset_name: string
          closing_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          investment_terms?: Json
          issuer_approval_status?: string
          issuer_name?: string | null
          notes?: string | null
          price_per_unit_cents?: number | null
          purchase_agreement_document_id?: string | null
          purchase_amount_cents?: number | null
          round_name?: string | null
          security_type?: string | null
          setup_id: string
          transfer_restrictions?: string | null
          unit_count?: number | null
          updated_at?: string
          valuation_cents?: number | null
        }
        Update: {
          asset_name?: string
          closing_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          investment_terms?: Json
          issuer_approval_status?: string
          issuer_name?: string | null
          notes?: string | null
          price_per_unit_cents?: number | null
          purchase_agreement_document_id?: string | null
          purchase_amount_cents?: number | null
          round_name?: string | null
          security_type?: string | null
          setup_id?: string
          transfer_restrictions?: string | null
          unit_count?: number | null
          updated_at?: string
          valuation_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_target_assets_purchase_agreement_document_id_fkey"
            columns: ["purchase_agreement_document_id"]
            isOneToOne: false
            referencedRelation: "fund_setup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_target_assets_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "fund_setups"
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
      individual_tax_documents: {
        Row: {
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          document_type: string
          household_id: string
          id: string
          issuer: string | null
          origin: string
          owner_user_id: string | null
          person_id: string | null
          return_id: string | null
          source_id: string | null
          source_table: string | null
          source_version: number | null
          status: string
          storage_path: string | null
          structured_data: Json
          tax_year: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          document_type: string
          household_id: string
          id?: string
          issuer?: string | null
          origin?: string
          owner_user_id?: string | null
          person_id?: string | null
          return_id?: string | null
          source_id?: string | null
          source_table?: string | null
          source_version?: number | null
          status?: string
          storage_path?: string | null
          structured_data?: Json
          tax_year: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          document_type?: string
          household_id?: string
          id?: string
          issuer?: string | null
          origin?: string
          owner_user_id?: string | null
          person_id?: string | null
          return_id?: string | null
          source_id?: string | null
          source_table?: string | null
          source_version?: number | null
          status?: string
          storage_path?: string | null
          structured_data?: Json
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "individual_tax_documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "taxpayer_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_tax_documents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_tax_documents_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "individual_tax_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_tax_returns: {
        Row: {
          amendment_reason: string | null
          approved_at: string | null
          approved_by: string | null
          calculation_version: string
          created_at: string
          delivered_at: string | null
          document_generated_at: string | null
          filing_status: string
          filing_status_code: string
          household_id: string
          id: string
          missing_information: Json
          prepared_at: string | null
          prepared_by: string | null
          primary_user_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          schedules: Json
          source_manifest: Json
          status: string
          supersedes_id: string | null
          tax_year: number
          tax_year_id: string | null
          taxpayer_approved_at: string | null
          taxpayer_approved_by: string | null
          totals: Json
          updated_at: string
          version: number
        }
        Insert: {
          amendment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculation_version?: string
          created_at?: string
          delivered_at?: string | null
          document_generated_at?: string | null
          filing_status?: string
          filing_status_code?: string
          household_id: string
          id?: string
          missing_information?: Json
          prepared_at?: string | null
          prepared_by?: string | null
          primary_user_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedules?: Json
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_year: number
          tax_year_id?: string | null
          taxpayer_approved_at?: string | null
          taxpayer_approved_by?: string | null
          totals?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          amendment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculation_version?: string
          created_at?: string
          delivered_at?: string | null
          document_generated_at?: string | null
          filing_status?: string
          filing_status_code?: string
          household_id?: string
          id?: string
          missing_information?: Json
          prepared_at?: string | null
          prepared_by?: string | null
          primary_user_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedules?: Json
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_year?: number
          tax_year_id?: string | null
          taxpayer_approved_at?: string | null
          taxpayer_approved_by?: string | null
          totals?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "individual_tax_returns_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "taxpayer_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_tax_returns_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "individual_tax_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_tax_returns_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_profile_relationships: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          is_authorized_signer: boolean
          ownership_percent: number | null
          person_id: string
          profile_id: string
          role: Database["public"]["Enums"]["profile_relationship_role"]
          status: string
          verification_status: Database["public"]["Enums"]["check_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          is_authorized_signer?: boolean
          ownership_percent?: number | null
          person_id: string
          profile_id: string
          role: Database["public"]["Enums"]["profile_relationship_role"]
          status?: string
          verification_status?: Database["public"]["Enums"]["check_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          is_authorized_signer?: boolean
          ownership_percent?: number | null
          person_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["profile_relationship_role"]
          status?: string
          verification_status?: Database["public"]["Enums"]["check_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_profile_relationships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_profile_relationships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_profile_snapshots: {
        Row: {
          application_id: string | null
          created_by: string | null
          id: string
          offering_id: string | null
          profile_id: string
          reason: string
          snapshot: Json
          subscription_id: string | null
          taken_at: string
        }
        Insert: {
          application_id?: string | null
          created_by?: string | null
          id?: string
          offering_id?: string | null
          profile_id: string
          reason?: string
          snapshot: Json
          subscription_id?: string | null
          taken_at?: string
        }
        Update: {
          application_id?: string | null
          created_by?: string | null
          id?: string
          offering_id?: string | null
          profile_id?: string
          reason?: string
          snapshot?: Json
          subscription_id?: string | null
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_profile_snapshots_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_profile_snapshots_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_profile_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_profile_snapshots_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_profiles: {
        Row: {
          created_at: string
          display_label: string
          id: string
          legacy_persona_id: string | null
          legal_name: string | null
          owner_user_id: string
          person_id: string | null
          profile_type: Database["public"]["Enums"]["investment_profile_type"]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_label: string
          id?: string
          legacy_persona_id?: string | null
          legal_name?: string | null
          owner_user_id: string
          person_id?: string | null
          profile_type: Database["public"]["Enums"]["investment_profile_type"]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_label?: string
          id?: string
          legacy_persona_id?: string | null
          legal_name?: string | null
          owner_user_id?: string
          person_id?: string | null
          profile_type?: Database["public"]["Enums"]["investment_profile_type"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_profiles_legacy_persona_id_fkey"
            columns: ["legacy_persona_id"]
            isOneToOne: true
            referencedRelation: "investor_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
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
      investor_classes: {
        Row: {
          carry_bps: number | null
          code: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          expense_share_pct: number | null
          id: string
          liquidity_terms: string | null
          management_fee_bps: number | null
          name: string
          offering_id: string
          preferred_return_bps: number | null
          series_label: string | null
          terms: Json
          updated_at: string
          version: number
        }
        Insert: {
          carry_bps?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          expense_share_pct?: number | null
          id?: string
          liquidity_terms?: string | null
          management_fee_bps?: number | null
          name: string
          offering_id: string
          preferred_return_bps?: number | null
          series_label?: string | null
          terms?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          carry_bps?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          expense_share_pct?: number | null
          id?: string
          liquidity_terms?: string | null
          management_fee_bps?: number | null
          name?: string
          offering_id?: string
          preferred_return_bps?: number | null
          series_label?: string | null
          terms?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_classes_offering_id_fkey"
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
      investor_notice_targets: {
        Row: {
          created_at: string
          id: string
          investment_profile_id: string | null
          investor_user_id: string
          notice_id: string
          offering_id: string
          position_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id: string
          notice_id: string
          offering_id: string
          position_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string
          notice_id?: string
          offering_id?: string
          position_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_notice_targets_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "investor_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_notice_targets_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_notice_targets_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_notices: {
        Row: {
          amount_cents: number | null
          body: string
          created_at: string
          created_by: string | null
          document_path: string | null
          due_date: string | null
          effective_date: string | null
          id: string
          kind: string
          offering_id: string
          period_label: string | null
          published_at: string | null
          published_by: string | null
          requires_acknowledgement: boolean
          status: string
          superseded_by_id: string | null
          supersedes_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents?: number | null
          body?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          due_date?: string | null
          effective_date?: string | null
          id?: string
          kind: string
          offering_id: string
          period_label?: string | null
          published_at?: string | null
          published_by?: string | null
          requires_acknowledgement?: boolean
          status?: string
          superseded_by_id?: string | null
          supersedes_id?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount_cents?: number | null
          body?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          due_date?: string | null
          effective_date?: string | null
          id?: string
          kind?: string
          offering_id?: string
          period_label?: string | null
          published_at?: string | null
          published_by?: string | null
          requires_acknowledgement?: boolean
          status?: string
          superseded_by_id?: string | null
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_notices_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_notices_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "investor_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_notices_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "investor_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_onboarding_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          detail: Json
          event: string
          from_status: string | null
          id: string
          offering_id: string | null
          onboarding_id: string | null
          subject_id: string | null
          subject_table: string | null
          to_status: string | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          from_status?: string | null
          id?: string
          offering_id?: string | null
          onboarding_id?: string | null
          subject_id?: string | null
          subject_table?: string | null
          to_status?: string | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          from_status?: string | null
          id?: string
          offering_id?: string | null
          onboarding_id?: string | null
          subject_id?: string | null
          subject_table?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_onboarding_events_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "investor_onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_onboarding_exceptions: {
        Row: {
          created_at: string
          detail: string | null
          exception_type: string
          id: string
          onboarding_id: string
          owner: string
          raised_by: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          exception_type: string
          id?: string
          onboarding_id: string
          owner?: string
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          exception_type?: string
          id?: string
          onboarding_id?: string
          owner?: string
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_onboarding_exceptions_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "investor_onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_onboardings: {
        Row: {
          acceptance_capacity: string | null
          accepted_amount_cents: number | null
          accepted_at: string | null
          accepted_by: string | null
          application_id: string | null
          approved_to_fund_at: string | null
          approved_to_fund_by: string | null
          assigned_to: string | null
          closed_amount_cents: number | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          document_template_version: number | null
          executed_snapshot: Json | null
          funded_amount_cents: number
          funding_released_at: string | null
          funding_status: string
          id: string
          investment_profile_id: string | null
          investor_reports_sent_at: string | null
          investor_user_id: string
          invitation_id: string | null
          last_activity_at: string
          offering_id: string
          person_id: string | null
          position_id: string | null
          questionnaire_responses: Json
          questionnaire_version: number | null
          requested_amount_cents: number | null
          signature_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          acceptance_capacity?: string | null
          accepted_amount_cents?: number | null
          accepted_at?: string | null
          accepted_by?: string | null
          application_id?: string | null
          approved_to_fund_at?: string | null
          approved_to_fund_by?: string | null
          assigned_to?: string | null
          closed_amount_cents?: number | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          document_template_version?: number | null
          executed_snapshot?: Json | null
          funded_amount_cents?: number
          funding_released_at?: string | null
          funding_status?: string
          id?: string
          investment_profile_id?: string | null
          investor_reports_sent_at?: string | null
          investor_user_id: string
          invitation_id?: string | null
          last_activity_at?: string
          offering_id: string
          person_id?: string | null
          position_id?: string | null
          questionnaire_responses?: Json
          questionnaire_version?: number | null
          requested_amount_cents?: number | null
          signature_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          acceptance_capacity?: string | null
          accepted_amount_cents?: number | null
          accepted_at?: string | null
          accepted_by?: string | null
          application_id?: string | null
          approved_to_fund_at?: string | null
          approved_to_fund_by?: string | null
          assigned_to?: string | null
          closed_amount_cents?: number | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          document_template_version?: number | null
          executed_snapshot?: Json | null
          funded_amount_cents?: number
          funding_released_at?: string | null
          funding_status?: string
          id?: string
          investment_profile_id?: string | null
          investor_reports_sent_at?: string | null
          investor_user_id?: string
          invitation_id?: string | null
          last_activity_at?: string
          offering_id?: string
          person_id?: string | null
          position_id?: string | null
          questionnaire_responses?: Json
          questionnaire_version?: number | null
          requested_amount_cents?: number | null
          signature_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_onboardings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_onboardings_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_onboardings_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "fund_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_onboardings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_onboardings_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_package_components: {
        Row: {
          created_at: string
          id: string
          offering_id: string
          package_id: string
          section_key: string
          snapshot: Json
          sort_order: number
          source_id: string | null
          source_status: string | null
          source_table: string | null
          source_version: number | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          offering_id: string
          package_id: string
          section_key: string
          snapshot?: Json
          sort_order?: number
          source_id?: string | null
          source_status?: string | null
          source_table?: string | null
          source_version?: number | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          offering_id?: string
          package_id?: string
          section_key?: string
          snapshot?: Json
          sort_order?: number
          source_id?: string | null
          source_status?: string | null
          source_table?: string | null
          source_version?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_package_components_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_package_components_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "investor_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_packages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branding: Json
          created_at: string
          exceptions: Json
          generated_at: string | null
          generated_by: string | null
          id: string
          investment_profile_id: string | null
          investor_user_id: string
          manager_note: string | null
          manager_responded_at: string | null
          manager_responded_by: string | null
          manager_response: string | null
          manifest: Json
          offering_id: string
          period_end: string
          period_kind: string
          period_label: string
          period_start: string
          position_id: string | null
          published_at: string | null
          published_by: string | null
          requires_acknowledgement: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          revision_reason: string | null
          sections: Json
          status: string
          superseded_by_id: string | null
          supersedes_id: string | null
          template_code: string | null
          template_id: string | null
          template_version: number | null
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branding?: Json
          created_at?: string
          exceptions?: Json
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          investment_profile_id?: string | null
          investor_user_id: string
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          manifest?: Json
          offering_id: string
          period_end: string
          period_kind?: string
          period_label: string
          period_start: string
          position_id?: string | null
          published_at?: string | null
          published_by?: string | null
          requires_acknowledgement?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_reason?: string | null
          sections?: Json
          status?: string
          superseded_by_id?: string | null
          supersedes_id?: string | null
          template_code?: string | null
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branding?: Json
          created_at?: string
          exceptions?: Json
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          manifest?: Json
          offering_id?: string
          period_end?: string
          period_kind?: string
          period_label?: string
          period_start?: string
          position_id?: string | null
          published_at?: string | null
          published_by?: string | null
          requires_acknowledgement?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_reason?: string | null
          sections?: Json
          status?: string
          superseded_by_id?: string | null
          supersedes_id?: string | null
          template_code?: string | null
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_packages_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_packages_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_packages_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "investor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_packages_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "investor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_packages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reporting_package_templates"
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
      investor_positions: {
        Row: {
          admitted_on: string | null
          application_id: string | null
          book_id: string | null
          capacity: string
          class_id: string | null
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          investment_profile_id: string | null
          investor_user_id: string | null
          is_gp: boolean
          notes: string | null
          offering_id: string
          person_id: string | null
          status: string
          transferred_to_id: string | null
          updated_at: string
          withdrawn_on: string | null
        }
        Insert: {
          admitted_on?: string | null
          application_id?: string | null
          book_id?: string | null
          capacity?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          is_gp?: boolean
          notes?: string | null
          offering_id: string
          person_id?: string | null
          status?: string
          transferred_to_id?: string | null
          updated_at?: string
          withdrawn_on?: string | null
        }
        Update: {
          admitted_on?: string | null
          application_id?: string | null
          book_id?: string | null
          capacity?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          is_gp?: boolean
          notes?: string | null
          offering_id?: string
          person_id?: string | null
          status?: string
          transferred_to_id?: string | null
          updated_at?: string
          withdrawn_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_positions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_positions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_positions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "investor_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_positions_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_positions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_positions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
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
      investor_statements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          capital_account_id: string | null
          created_at: string
          id: string
          investment_profile_id: string | null
          investor_user_id: string | null
          offering_id: string
          period_end: string
          period_start: string
          position_id: string
          prepared_at: string
          prepared_by: string | null
          provenance: Json
          published_at: string | null
          published_by: string | null
          report_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string | null
          snapshot: Json
          status: string
          supersedes_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          capital_account_id?: string | null
          created_at?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          offering_id: string
          period_end: string
          period_start: string
          position_id: string
          prepared_at?: string
          prepared_by?: string | null
          provenance?: Json
          published_at?: string | null
          published_by?: string | null
          report_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          snapshot?: Json
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          capital_account_id?: string | null
          created_at?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          offering_id?: string
          period_end?: string
          period_start?: string
          position_id?: string
          prepared_at?: string
          prepared_by?: string | null
          provenance?: Json
          published_at?: string | null
          published_by?: string | null
          report_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          snapshot?: Json
          status?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_statements_capital_account_id_fkey"
            columns: ["capital_account_id"]
            isOneToOne: false
            referencedRelation: "capital_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_statements_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_statements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_statements_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_statements_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_statements_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_statements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "investor_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_tax_profiles: {
        Row: {
          classification: string
          created_at: string
          default_withholding_rate_bps: number | null
          document_id: string | null
          documentation_effective_on: string | null
          documentation_expires_on: string | null
          documentation_form: Database["public"]["Enums"]["tax_documentation_form"]
          documentation_status: Database["public"]["Enums"]["tax_workflow_status"]
          id: string
          investment_profile_id: string | null
          investor_user_id: string | null
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          tax_residency_country: string | null
          tin_on_file: boolean
          treaty_country: string | null
          treaty_rate_bps: number | null
          updated_at: string
        }
        Insert: {
          classification?: string
          created_at?: string
          default_withholding_rate_bps?: number | null
          document_id?: string | null
          documentation_effective_on?: string | null
          documentation_expires_on?: string | null
          documentation_form?: Database["public"]["Enums"]["tax_documentation_form"]
          documentation_status?: Database["public"]["Enums"]["tax_workflow_status"]
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          tax_residency_country?: string | null
          tin_on_file?: boolean
          treaty_country?: string | null
          treaty_rate_bps?: number | null
          updated_at?: string
        }
        Update: {
          classification?: string
          created_at?: string
          default_withholding_rate_bps?: number | null
          document_id?: string | null
          documentation_effective_on?: string | null
          documentation_expires_on?: string | null
          documentation_form?: Database["public"]["Enums"]["tax_documentation_form"]
          documentation_status?: Database["public"]["Enums"]["tax_workflow_status"]
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          tax_residency_country?: string | null
          tin_on_file?: boolean
          treaty_country?: string | null
          treaty_rate_bps?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_tax_profiles_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fund_tax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_tax_profiles_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
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
      journal_entries: {
        Row: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          book_id: string
          created_at: string
          entry_date: string
          entry_no: number
          id: string
          memo: string | null
          period_id: string | null
          posted_at: string | null
          posted_by: string | null
          prepared_at: string
          prepared_by: string | null
          reverses_entry_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["journal_source"]
          source_id: string | null
          source_table: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
        }
        Insert: {
          adjusts_entry_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          book_id: string
          created_at?: string
          entry_date: string
          entry_no?: number
          id?: string
          memo?: string | null
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          prepared_at?: string
          prepared_by?: string | null
          reverses_entry_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Update: {
          adjusts_entry_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          book_id?: string
          created_at?: string
          entry_date?: string
          entry_no?: number
          id?: string
          memo?: string | null
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          prepared_at?: string
          prepared_by?: string | null
          reverses_entry_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_adjusts_entry_id_fkey"
            columns: ["adjusts_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entry_id: string
          from_status: Database["public"]["Enums"]["journal_status"] | null
          id: string
          reason: string | null
          snapshot: Json | null
          to_status: Database["public"]["Enums"]["journal_status"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entry_id: string
          from_status?: Database["public"]["Enums"]["journal_status"] | null
          id?: string
          reason?: string | null
          snapshot?: Json | null
          to_status: Database["public"]["Enums"]["journal_status"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entry_id?: string
          from_status?: Database["public"]["Enums"]["journal_status"] | null
          id?: string
          reason?: string | null
          snapshot?: Json | null
          to_status?: Database["public"]["Enums"]["journal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_events_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          application_id: string | null
          client_entity_id: string | null
          created_at: string
          credit_cents: number
          debit_cents: number
          entry_id: string
          id: string
          investment_id: string | null
          investment_profile_id: string | null
          investor_user_id: string | null
          line_no: number
          memo: string | null
          offering_id: string | null
        }
        Insert: {
          account_id: string
          application_id?: string | null
          client_entity_id?: string | null
          created_at?: string
          credit_cents?: number
          debit_cents?: number
          entry_id: string
          id?: string
          investment_id?: string | null
          investment_profile_id?: string | null
          investor_user_id?: string | null
          line_no?: number
          memo?: string | null
          offering_id?: string | null
        }
        Update: {
          account_id?: string
          application_id?: string | null
          client_entity_id?: string | null
          created_at?: string
          credit_cents?: number
          debit_cents?: number
          entry_id?: string
          id?: string
          investment_id?: string | null
          investment_profile_id?: string | null
          investor_user_id?: string | null
          line_no?: number
          memo?: string | null
          offering_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "investor_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_client_entity_id_fkey"
            columns: ["client_entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      k1_forms: {
        Row: {
          amendment_reason: string | null
          approved_at: string | null
          approved_by: string | null
          book_capital: Json
          boxes: Json
          created_at: string
          delivered_at: string | null
          id: string
          investment_profile_id: string | null
          investor_user_id: string
          is_foreign: boolean
          offering_id: string
          outside_basis: Json
          outside_basis_available: boolean
          partner_classification: string | null
          position_id: string | null
          prepared_at: string | null
          prepared_by: string | null
          return_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_manifest: Json
          status: string
          storage_path: string | null
          supersedes_id: string | null
          tax_capital: Json
          tax_year: number
          tax_year_id: string
          updated_at: string
          version: number
        }
        Insert: {
          amendment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          book_capital?: Json
          boxes?: Json
          created_at?: string
          delivered_at?: string | null
          id?: string
          investment_profile_id?: string | null
          investor_user_id: string
          is_foreign?: boolean
          offering_id: string
          outside_basis?: Json
          outside_basis_available?: boolean
          partner_classification?: string | null
          position_id?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          return_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          storage_path?: string | null
          supersedes_id?: string | null
          tax_capital?: Json
          tax_year: number
          tax_year_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          amendment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          book_capital?: Json
          boxes?: Json
          created_at?: string
          delivered_at?: string | null
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string
          is_foreign?: boolean
          offering_id?: string
          outside_basis?: Json
          outside_basis_available?: boolean
          partner_classification?: string | null
          position_id?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          return_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_manifest?: Json
          status?: string
          storage_path?: string | null
          supersedes_id?: string | null
          tax_capital?: Json
          tax_year?: number
          tax_year_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "k1_forms_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "k1_forms_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "k1_forms_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "k1_forms_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "partnership_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "k1_forms_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "k1_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "k1_forms_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
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
      ledger_books: {
        Row: {
          allocation_policy: Json
          basis: Database["public"]["Enums"]["ledger_basis"]
          client_entity_id: string | null
          client_id: string | null
          close_policy: Json
          created_at: string
          created_by: string | null
          ct_company_id: string | null
          domain: Database["public"]["Enums"]["report_domain"]
          fiscal_year_end_month: number
          functional_currency: string
          id: string
          is_active: boolean
          name: string
          offering_id: string | null
          updated_at: string
        }
        Insert: {
          allocation_policy?: Json
          basis?: Database["public"]["Enums"]["ledger_basis"]
          client_entity_id?: string | null
          client_id?: string | null
          close_policy?: Json
          created_at?: string
          created_by?: string | null
          ct_company_id?: string | null
          domain?: Database["public"]["Enums"]["report_domain"]
          fiscal_year_end_month?: number
          functional_currency?: string
          id?: string
          is_active?: boolean
          name: string
          offering_id?: string | null
          updated_at?: string
        }
        Update: {
          allocation_policy?: Json
          basis?: Database["public"]["Enums"]["ledger_basis"]
          client_entity_id?: string | null
          client_id?: string | null
          close_policy?: Json
          created_at?: string
          created_by?: string | null
          ct_company_id?: string | null
          domain?: Database["public"]["Enums"]["report_domain"]
          fiscal_year_end_month?: number
          functional_currency?: string
          id?: string
          is_active?: boolean
          name?: string
          offering_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_books_client_entity_id_fkey"
            columns: ["client_entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_books_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_books_ct_company_id_fkey"
            columns: ["ct_company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_books_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
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
      management_fee_terms: {
        Row: {
          basis: string
          class_id: string | null
          created_at: string
          created_by: string | null
          ends_on: string | null
          flat_amount_cents: number
          frequency: string
          id: string
          note: string | null
          offering_id: string
          offset_pct: number
          position_id: string | null
          rate_bps: number
          starts_on: string
          step_downs: Json
          updated_at: string
          version: number
          waiver_bps: number
        }
        Insert: {
          basis?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          flat_amount_cents?: number
          frequency?: string
          id?: string
          note?: string | null
          offering_id: string
          offset_pct?: number
          position_id?: string | null
          rate_bps?: number
          starts_on: string
          step_downs?: Json
          updated_at?: string
          version?: number
          waiver_bps?: number
        }
        Update: {
          basis?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          flat_amount_cents?: number
          frequency?: string
          id?: string
          note?: string | null
          offering_id?: string
          offset_pct?: number
          position_id?: string | null
          rate_bps?: number
          starts_on?: string
          step_downs?: Json
          updated_at?: string
          version?: number
          waiver_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "management_fee_terms_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "investor_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_fee_terms_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_fee_terms_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
        ]
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
      nav_checks: {
        Row: {
          code: string
          context: Json
          created_at: string
          detail: string | null
          id: string
          nav_version_id: string
          offering_id: string | null
          overridable: boolean
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          severity: string
        }
        Insert: {
          code: string
          context?: Json
          created_at?: string
          detail?: string | null
          id?: string
          nav_version_id: string
          offering_id?: string | null
          overridable?: boolean
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          severity?: string
        }
        Update: {
          code?: string
          context?: Json
          created_at?: string
          detail?: string | null
          id?: string
          nav_version_id?: string
          offering_id?: string | null
          overridable?: boolean
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_checks_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_checks_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_events: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          created_at: string
          from_status: string | null
          id: string
          nav_version_id: string | null
          offering_id: string | null
          payload: Json
          reason: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          nav_version_id?: string | null
          offering_id?: string | null
          payload?: Json
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          nav_version_id?: string | null
          offering_id?: string | null
          payload?: Json
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_events_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_policies: {
        Row: {
          blocking_checks: Json
          book_id: string | null
          created_at: string
          created_by: string | null
          frequency: string
          id: string
          is_active: boolean
          manager_approval_required: boolean
          manager_workflow: string
          methodology_version: string
          offering_id: string | null
          open_item_tolerance_cents: number
          unit_accounting: boolean
          unposted_journal_tolerance_cents: number
          unreconciled_cash_tolerance_cents: number
          updated_at: string
          valuation_staleness_days: number
        }
        Insert: {
          blocking_checks?: Json
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          manager_approval_required?: boolean
          manager_workflow?: string
          methodology_version?: string
          offering_id?: string | null
          open_item_tolerance_cents?: number
          unit_accounting?: boolean
          unposted_journal_tolerance_cents?: number
          unreconciled_cash_tolerance_cents?: number
          updated_at?: string
          valuation_staleness_days?: number
        }
        Update: {
          blocking_checks?: Json
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          manager_approval_required?: boolean
          manager_workflow?: string
          methodology_version?: string
          offering_id?: string | null
          open_item_tolerance_cents?: number
          unit_accounting?: boolean
          unposted_journal_tolerance_cents?: number
          unreconciled_cash_tolerance_cents?: number
          updated_at?: string
          valuation_staleness_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "nav_policies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_policies_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_versions: {
        Row: {
          accrued_expenses_cents: number
          accrued_income_cents: number
          approved_at: string | null
          approved_by: string | null
          as_of_date: string
          book_id: string
          bridge: Json
          capital_handoff: Json
          carried_interest_cents: number
          cash_cents: number
          change_cents: number
          change_pct: number | null
          checks: Json
          contributions_cents: number
          created_at: string
          distributions_cents: number
          frequency: string
          fund_expenses_cents: number
          gross_asset_value_cents: number
          id: string
          inputs_snapshot: Json
          investment_income_cents: number
          investments_at_cost_cents: number
          investments_fair_value_cents: number
          ledger_snapshot: Json
          liabilities_cents: number
          management_fee_cents: number
          manager_acknowledged_at: string | null
          manager_acknowledged_by: string | null
          manager_approved_at: string | null
          manager_approved_by: string | null
          manager_challenge_note: string | null
          methodology: string
          methodology_version: string
          nav_per_unit_cents: number | null
          net_asset_value_cents: number
          offering_id: string | null
          other_assets_cents: number
          other_liabilities_cents: number
          overrides: Json
          partner_capital_cents: number
          payables_cents: number
          period_id: string | null
          period_label: string | null
          period_start: string | null
          prepared_at: string
          prepared_by: string | null
          prior_nav_cents: number
          prior_nav_version_id: string | null
          published_at: string | null
          published_by: string | null
          realized_gain_cents: number
          receivables_cents: number
          reviewed_at: string | null
          reviewed_by: string | null
          revision_impact_cents: number | null
          revision_impact_pct: number | null
          revision_reason: string | null
          source_cutoff_at: string | null
          status: Database["public"]["Enums"]["nav_status"]
          superseded_by_id: string | null
          supersedes_id: string | null
          tax_liabilities_cents: number
          total_liabilities_cents: number
          unit_accounting: boolean
          units_issued: number | null
          units_outstanding: number | null
          units_redeemed: number | null
          unrealized_gain_cents: number
          updated_at: string
          valuation_source: string | null
          valuation_versions: Json
          version: number
        }
        Insert: {
          accrued_expenses_cents?: number
          accrued_income_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          as_of_date: string
          book_id: string
          bridge?: Json
          capital_handoff?: Json
          carried_interest_cents?: number
          cash_cents?: number
          change_cents?: number
          change_pct?: number | null
          checks?: Json
          contributions_cents?: number
          created_at?: string
          distributions_cents?: number
          frequency?: string
          fund_expenses_cents?: number
          gross_asset_value_cents?: number
          id?: string
          inputs_snapshot?: Json
          investment_income_cents?: number
          investments_at_cost_cents?: number
          investments_fair_value_cents?: number
          ledger_snapshot?: Json
          liabilities_cents?: number
          management_fee_cents?: number
          manager_acknowledged_at?: string | null
          manager_acknowledged_by?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          manager_challenge_note?: string | null
          methodology?: string
          methodology_version?: string
          nav_per_unit_cents?: number | null
          net_asset_value_cents?: number
          offering_id?: string | null
          other_assets_cents?: number
          other_liabilities_cents?: number
          overrides?: Json
          partner_capital_cents?: number
          payables_cents?: number
          period_id?: string | null
          period_label?: string | null
          period_start?: string | null
          prepared_at?: string
          prepared_by?: string | null
          prior_nav_cents?: number
          prior_nav_version_id?: string | null
          published_at?: string | null
          published_by?: string | null
          realized_gain_cents?: number
          receivables_cents?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_impact_cents?: number | null
          revision_impact_pct?: number | null
          revision_reason?: string | null
          source_cutoff_at?: string | null
          status?: Database["public"]["Enums"]["nav_status"]
          superseded_by_id?: string | null
          supersedes_id?: string | null
          tax_liabilities_cents?: number
          total_liabilities_cents?: number
          unit_accounting?: boolean
          units_issued?: number | null
          units_outstanding?: number | null
          units_redeemed?: number | null
          unrealized_gain_cents?: number
          updated_at?: string
          valuation_source?: string | null
          valuation_versions?: Json
          version?: number
        }
        Update: {
          accrued_expenses_cents?: number
          accrued_income_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          as_of_date?: string
          book_id?: string
          bridge?: Json
          capital_handoff?: Json
          carried_interest_cents?: number
          cash_cents?: number
          change_cents?: number
          change_pct?: number | null
          checks?: Json
          contributions_cents?: number
          created_at?: string
          distributions_cents?: number
          frequency?: string
          fund_expenses_cents?: number
          gross_asset_value_cents?: number
          id?: string
          inputs_snapshot?: Json
          investment_income_cents?: number
          investments_at_cost_cents?: number
          investments_fair_value_cents?: number
          ledger_snapshot?: Json
          liabilities_cents?: number
          management_fee_cents?: number
          manager_acknowledged_at?: string | null
          manager_acknowledged_by?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          manager_challenge_note?: string | null
          methodology?: string
          methodology_version?: string
          nav_per_unit_cents?: number | null
          net_asset_value_cents?: number
          offering_id?: string | null
          other_assets_cents?: number
          other_liabilities_cents?: number
          overrides?: Json
          partner_capital_cents?: number
          payables_cents?: number
          period_id?: string | null
          period_label?: string | null
          period_start?: string | null
          prepared_at?: string
          prepared_by?: string | null
          prior_nav_cents?: number
          prior_nav_version_id?: string | null
          published_at?: string | null
          published_by?: string | null
          realized_gain_cents?: number
          receivables_cents?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_impact_cents?: number | null
          revision_impact_pct?: number | null
          revision_reason?: string | null
          source_cutoff_at?: string | null
          status?: Database["public"]["Enums"]["nav_status"]
          superseded_by_id?: string | null
          supersedes_id?: string | null
          tax_liabilities_cents?: number
          total_liabilities_cents?: number
          unit_accounting?: boolean
          units_issued?: number | null
          units_outstanding?: number | null
          units_redeemed?: number | null
          unrealized_gain_cents?: number
          updated_at?: string
          valuation_source?: string | null
          valuation_versions?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nav_versions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_versions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_versions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_versions_prior_nav_version_id_fkey"
            columns: ["prior_nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_versions_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
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
      offering_questionnaires: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          offering_id: string
          published_at: string | null
          published_by: string | null
          questions: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          offering_id: string
          published_at?: string | null
          published_by?: string | null
          questions?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          offering_id?: string
          published_at?: string | null
          published_by?: string | null
          questions?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offering_questionnaires_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_requirements: {
        Row: {
          accreditation_max_age_days: number | null
          accreditation_required: boolean
          accreditation_verification: string
          created_at: string
          notes: string | null
          offering_id: string
          requires_control_person_kyc: boolean
          requires_entity_kyb: boolean
          requires_person_aml: boolean
          requires_person_kyc: boolean
          updated_at: string
        }
        Insert: {
          accreditation_max_age_days?: number | null
          accreditation_required?: boolean
          accreditation_verification?: string
          created_at?: string
          notes?: string | null
          offering_id: string
          requires_control_person_kyc?: boolean
          requires_entity_kyb?: boolean
          requires_person_aml?: boolean
          requires_person_kyc?: boolean
          updated_at?: string
        }
        Update: {
          accreditation_max_age_days?: number | null
          accreditation_required?: boolean
          accreditation_verification?: string
          created_at?: string
          notes?: string | null
          offering_id?: string
          requires_control_person_kyc?: boolean
          requires_entity_kyb?: boolean
          requires_person_aml?: boolean
          requires_person_kyc?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_requirements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
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
      partnership_returns: {
        Row: {
          adjustments_cents: number
          allocation_run_id: string | null
          amendment_reason: string | null
          approved_at: string | null
          approved_by: string | null
          book_income_cents: number
          capital_reconciliation: Json
          created_at: string
          document_generated_at: string | null
          ein_last4: string | null
          exceptions: Json
          filing_status: string
          form_type: string
          id: string
          manager_note: string | null
          manager_responded_at: string | null
          manager_responded_by: string | null
          manager_response: string | null
          offering_id: string
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          separately_stated: Json
          source_manifest: Json
          status: string
          supersedes_id: string | null
          tax_income_cents: number
          tax_year: number
          tax_year_id: string
          updated_at: string
          version: number
        }
        Insert: {
          adjustments_cents?: number
          allocation_run_id?: string | null
          amendment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          book_income_cents?: number
          capital_reconciliation?: Json
          created_at?: string
          document_generated_at?: string | null
          ein_last4?: string | null
          exceptions?: Json
          filing_status?: string
          form_type?: string
          id?: string
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          offering_id: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          separately_stated?: Json
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_income_cents?: number
          tax_year: number
          tax_year_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          adjustments_cents?: number
          allocation_run_id?: string | null
          amendment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          book_income_cents?: number
          capital_reconciliation?: Json
          created_at?: string
          document_generated_at?: string | null
          ein_last4?: string | null
          exceptions?: Json
          filing_status?: string
          form_type?: string
          id?: string
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          offering_id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          separately_stated?: Json
          source_manifest?: Json
          status?: string
          supersedes_id?: string | null
          tax_income_cents?: number
          tax_year?: number
          tax_year_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "partnership_returns_allocation_run_id_fkey"
            columns: ["allocation_run_id"]
            isOneToOne: false
            referencedRelation: "tax_allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_returns_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_returns_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "partnership_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_returns_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
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
      payee_payment_records: {
        Row: {
          created_at: string
          dedupe_key: string
          determination_reasons: Json
          determination_status: string
          entity_id: string | null
          filing_responsibility: string
          gross_amount_cents: number
          id: string
          offering_id: string | null
          paid_on: string | null
          payee_classification: string | null
          payee_name: string
          payee_profile_id: string | null
          payee_user_id: string | null
          payment_type: string
          proposed_form_type: string | null
          reportable_amount_cents: number | null
          source_id: string | null
          source_type: string
          tax_document_id: string | null
          tax_year: number
          tin_on_file: boolean
          updated_at: string
          withheld_cents: number
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          determination_reasons?: Json
          determination_status?: string
          entity_id?: string | null
          filing_responsibility?: string
          gross_amount_cents?: number
          id?: string
          offering_id?: string | null
          paid_on?: string | null
          payee_classification?: string | null
          payee_name: string
          payee_profile_id?: string | null
          payee_user_id?: string | null
          payment_type: string
          proposed_form_type?: string | null
          reportable_amount_cents?: number | null
          source_id?: string | null
          source_type: string
          tax_document_id?: string | null
          tax_year: number
          tin_on_file?: boolean
          updated_at?: string
          withheld_cents?: number
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          determination_reasons?: Json
          determination_status?: string
          entity_id?: string | null
          filing_responsibility?: string
          gross_amount_cents?: number
          id?: string
          offering_id?: string | null
          paid_on?: string | null
          payee_classification?: string | null
          payee_name?: string
          payee_profile_id?: string | null
          payee_user_id?: string | null
          payment_type?: string
          proposed_form_type?: string | null
          reportable_amount_cents?: number | null
          source_id?: string | null
          source_type?: string
          tax_document_id?: string | null
          tax_year?: number
          tin_on_file?: boolean
          updated_at?: string
          withheld_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payee_payment_records_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payee_payment_records_payee_profile_id_fkey"
            columns: ["payee_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payee_payment_records_tax_document_id_fkey"
            columns: ["tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_document_records"
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
      performance_benchmarks: {
        Row: {
          as_of: string | null
          created_at: string
          created_by: string | null
          id: string
          methodology: string
          name: string
          note: string | null
          offering_id: string | null
          period_end: string
          period_start: string
          return_bps: number | null
          run_id: string | null
          source: string
          value_status: string
        }
        Insert: {
          as_of?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          methodology?: string
          name: string
          note?: string | null
          offering_id?: string | null
          period_end: string
          period_start: string
          return_bps?: number | null
          run_id?: string | null
          source: string
          value_status?: string
        }
        Update: {
          as_of?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          methodology?: string
          name?: string
          note?: string | null
          offering_id?: string | null
          period_end?: string
          period_start?: string
          return_bps?: number | null
          run_id?: string | null
          source?: string
          value_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_benchmarks_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_benchmarks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_calculations: {
        Row: {
          approved_by: string | null
          beginning_value_cents: number
          book_id: string
          calculated_at: string
          calculated_by: string | null
          capital_account_id: string | null
          contributions_cents: number
          created_at: string
          distributions_cents: number
          dpi: number | null
          ending_value_cents: number
          gross_return_bps: number | null
          id: string
          inputs: Json
          investment_profile_id: string | null
          investor_user_id: string | null
          irr_bps: number | null
          methodology_version: string
          moic: number | null
          nav_version_id: string | null
          net_return_bps: number | null
          offering_id: string | null
          period_end: string
          period_start: string
          published_at: string | null
          realized_gain_cents: number
          rvpi: number | null
          scope: string
          status: Database["public"]["Enums"]["report_status"]
          tvpi: number | null
          twr_bps: number | null
          unrealized_gain_cents: number
        }
        Insert: {
          approved_by?: string | null
          beginning_value_cents?: number
          book_id: string
          calculated_at?: string
          calculated_by?: string | null
          capital_account_id?: string | null
          contributions_cents?: number
          created_at?: string
          distributions_cents?: number
          dpi?: number | null
          ending_value_cents?: number
          gross_return_bps?: number | null
          id?: string
          inputs?: Json
          investment_profile_id?: string | null
          investor_user_id?: string | null
          irr_bps?: number | null
          methodology_version?: string
          moic?: number | null
          nav_version_id?: string | null
          net_return_bps?: number | null
          offering_id?: string | null
          period_end: string
          period_start: string
          published_at?: string | null
          realized_gain_cents?: number
          rvpi?: number | null
          scope?: string
          status?: Database["public"]["Enums"]["report_status"]
          tvpi?: number | null
          twr_bps?: number | null
          unrealized_gain_cents?: number
        }
        Update: {
          approved_by?: string | null
          beginning_value_cents?: number
          book_id?: string
          calculated_at?: string
          calculated_by?: string | null
          capital_account_id?: string | null
          contributions_cents?: number
          created_at?: string
          distributions_cents?: number
          dpi?: number | null
          ending_value_cents?: number
          gross_return_bps?: number | null
          id?: string
          inputs?: Json
          investment_profile_id?: string | null
          investor_user_id?: string | null
          irr_bps?: number | null
          methodology_version?: string
          moic?: number | null
          nav_version_id?: string | null
          net_return_bps?: number | null
          offering_id?: string | null
          period_end?: string
          period_start?: string
          published_at?: string | null
          realized_gain_cents?: number
          rvpi?: number | null
          scope?: string
          status?: Database["public"]["Enums"]["report_status"]
          tvpi?: number | null
          twr_bps?: number | null
          unrealized_gain_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_calculations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_calculations_capital_account_id_fkey"
            columns: ["capital_account_id"]
            isOneToOne: false
            referencedRelation: "capital_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_calculations_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_calculations_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_calculations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_configs: {
        Row: {
          blocking_exception_kinds: string[]
          book_id: string | null
          created_at: string
          default_frequency: string
          enabled_metrics: string[]
          fund_type: string
          id: string
          investor_reporting_enabled: boolean
          large_movement_threshold_bps: number
          manager_response_enabled: boolean
          methodology_id: string | null
          notes: string | null
          offering_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          blocking_exception_kinds?: string[]
          book_id?: string | null
          created_at?: string
          default_frequency?: string
          enabled_metrics?: string[]
          fund_type?: string
          id?: string
          investor_reporting_enabled?: boolean
          large_movement_threshold_bps?: number
          manager_response_enabled?: boolean
          methodology_id?: string | null
          notes?: string | null
          offering_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          blocking_exception_kinds?: string[]
          book_id?: string | null
          created_at?: string
          default_frequency?: string
          enabled_metrics?: string[]
          fund_type?: string
          id?: string
          investor_reporting_enabled?: boolean
          large_movement_threshold_bps?: number
          manager_response_enabled?: boolean
          methodology_id?: string | null
          notes?: string | null
          offering_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_configs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_configs_methodology_id_fkey"
            columns: ["methodology_id"]
            isOneToOne: false
            referencedRelation: "performance_methodologies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_configs_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: true
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          from_status: string | null
          id: string
          offering_id: string | null
          run_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          from_status?: string | null
          id?: string
          offering_id?: string | null
          run_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          from_status?: string | null
          id?: string
          offering_id?: string | null
          run_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_lines: {
        Row: {
          allocated_income_cents: number
          beginning_capital_cents: number
          bridge: Json
          capacity: string
          capital_account_id: string | null
          carry_cents: number
          cash_flows: Json
          commitment_cents: number
          contributions_cents: number
          created_at: string
          display_name: string
          distributions_cents: number
          dpi: number | null
          ending_capital_cents: number
          exceptions: Json
          expenses_cents: number
          fees_cents: number
          gross_return_bps: number | null
          id: string
          inputs: Json
          investment_profile_id: string | null
          investor_user_id: string | null
          irr_bps: number | null
          irr_status: string
          is_gp: boolean
          moic: number | null
          net_return_bps: number | null
          offering_id: string
          paid_in_capital_cents: number
          position_id: string | null
          realized_gain_cents: number
          realized_value_cents: number
          remaining_value_cents: number
          run_id: string
          rvpi: number | null
          total_value_cents: number
          tvpi: number | null
          twr_bps: number | null
          twr_status: string
          unfunded_commitment_cents: number
          unrealized_gain_cents: number
        }
        Insert: {
          allocated_income_cents?: number
          beginning_capital_cents?: number
          bridge?: Json
          capacity?: string
          capital_account_id?: string | null
          carry_cents?: number
          cash_flows?: Json
          commitment_cents?: number
          contributions_cents?: number
          created_at?: string
          display_name?: string
          distributions_cents?: number
          dpi?: number | null
          ending_capital_cents?: number
          exceptions?: Json
          expenses_cents?: number
          fees_cents?: number
          gross_return_bps?: number | null
          id?: string
          inputs?: Json
          investment_profile_id?: string | null
          investor_user_id?: string | null
          irr_bps?: number | null
          irr_status?: string
          is_gp?: boolean
          moic?: number | null
          net_return_bps?: number | null
          offering_id: string
          paid_in_capital_cents?: number
          position_id?: string | null
          realized_gain_cents?: number
          realized_value_cents?: number
          remaining_value_cents?: number
          run_id: string
          rvpi?: number | null
          total_value_cents?: number
          tvpi?: number | null
          twr_bps?: number | null
          twr_status?: string
          unfunded_commitment_cents?: number
          unrealized_gain_cents?: number
        }
        Update: {
          allocated_income_cents?: number
          beginning_capital_cents?: number
          bridge?: Json
          capacity?: string
          capital_account_id?: string | null
          carry_cents?: number
          cash_flows?: Json
          commitment_cents?: number
          contributions_cents?: number
          created_at?: string
          display_name?: string
          distributions_cents?: number
          dpi?: number | null
          ending_capital_cents?: number
          exceptions?: Json
          expenses_cents?: number
          fees_cents?: number
          gross_return_bps?: number | null
          id?: string
          inputs?: Json
          investment_profile_id?: string | null
          investor_user_id?: string | null
          irr_bps?: number | null
          irr_status?: string
          is_gp?: boolean
          moic?: number | null
          net_return_bps?: number | null
          offering_id?: string
          paid_in_capital_cents?: number
          position_id?: string | null
          realized_gain_cents?: number
          realized_value_cents?: number
          remaining_value_cents?: number
          run_id?: string
          rvpi?: number | null
          total_value_cents?: number
          tvpi?: number | null
          twr_bps?: number | null
          twr_status?: string
          unfunded_commitment_cents?: number
          unrealized_gain_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_lines_capital_account_id_fkey"
            columns: ["capital_account_id"]
            isOneToOne: false
            referencedRelation: "capital_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_lines_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_lines_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_lines_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_methodologies: {
        Row: {
          annualization: string
          benchmark_methodology: Json
          book_id: string | null
          calculation_method: string
          capital_definition: string
          carry_treatment: Json
          cash_flow_timing: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          exception_policy: Json
          expense_treatment: Json
          fee_treatment: Json
          fund_type: string
          id: string
          label: string
          metrics: string[]
          notes: string | null
          offering_id: string | null
          rounding: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          annualization?: string
          benchmark_methodology?: Json
          book_id?: string | null
          calculation_method?: string
          capital_definition?: string
          carry_treatment?: Json
          cash_flow_timing?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          exception_policy?: Json
          expense_treatment?: Json
          fee_treatment?: Json
          fund_type?: string
          id?: string
          label: string
          metrics?: string[]
          notes?: string | null
          offering_id?: string | null
          rounding?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          annualization?: string
          benchmark_methodology?: Json
          book_id?: string | null
          calculation_method?: string
          capital_definition?: string
          carry_treatment?: Json
          cash_flow_timing?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          exception_policy?: Json
          expense_treatment?: Json
          fee_treatment?: Json
          fund_type?: string
          id?: string
          label?: string
          metrics?: string[]
          notes?: string | null
          offering_id?: string | null
          rounding?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_methodologies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_methodologies_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_runs: {
        Row: {
          allocation_run_id: string | null
          approved_at: string | null
          approved_by: string | null
          beginning_nav_version_id: string | null
          beginning_value_cents: number
          benchmarks: Json
          book_id: string | null
          bridge: Json
          carried_interest_cents: number
          cash_flows: Json
          contributions_cents: number
          created_at: string
          cumulative_return_bps: number | null
          distributions_cents: number
          dpi: number | null
          ending_value_cents: number
          exceptions: Json
          expenses_cents: number
          fund_type: string
          gross_return_bps: number | null
          id: string
          inputs_snapshot: Json
          investment_income_cents: number
          investor_visible: boolean
          irr_bps: number | null
          irr_status: string
          management_fees_cents: number
          manager_note: string | null
          manager_responded_at: string | null
          manager_responded_by: string | null
          manager_response: string | null
          manager_visible: boolean
          methodology_id: string | null
          methodology_snapshot: Json
          methodology_version: string
          metrics: Json
          moic: number | null
          nav_version_id: string | null
          net_return_bps: number | null
          offering_id: string
          overrides: Json
          paid_in_capital_cents: number
          period_end: string
          period_kind: string
          period_label: string
          period_start: string
          prepared_at: string
          prepared_by: string | null
          prior_run_id: string | null
          published_at: string | null
          published_by: string | null
          realized_gain_cents: number
          realized_value_cents: number
          remaining_value_cents: number
          report_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision_reason: string | null
          rvpi: number | null
          source_cutoff_at: string
          status: Database["public"]["Enums"]["report_status"]
          subperiods: Json
          superseded_by_id: string | null
          supersedes_id: string | null
          total_value_cents: number
          tvpi: number | null
          twr_bps: number | null
          twr_status: string
          unfunded_commitment_cents: number
          unrealized_gain_cents: number
          updated_at: string
          version: number
        }
        Insert: {
          allocation_run_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          beginning_nav_version_id?: string | null
          beginning_value_cents?: number
          benchmarks?: Json
          book_id?: string | null
          bridge?: Json
          carried_interest_cents?: number
          cash_flows?: Json
          contributions_cents?: number
          created_at?: string
          cumulative_return_bps?: number | null
          distributions_cents?: number
          dpi?: number | null
          ending_value_cents?: number
          exceptions?: Json
          expenses_cents?: number
          fund_type?: string
          gross_return_bps?: number | null
          id?: string
          inputs_snapshot?: Json
          investment_income_cents?: number
          investor_visible?: boolean
          irr_bps?: number | null
          irr_status?: string
          management_fees_cents?: number
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          manager_visible?: boolean
          methodology_id?: string | null
          methodology_snapshot?: Json
          methodology_version?: string
          metrics?: Json
          moic?: number | null
          nav_version_id?: string | null
          net_return_bps?: number | null
          offering_id: string
          overrides?: Json
          paid_in_capital_cents?: number
          period_end: string
          period_kind?: string
          period_label?: string
          period_start: string
          prepared_at?: string
          prepared_by?: string | null
          prior_run_id?: string | null
          published_at?: string | null
          published_by?: string | null
          realized_gain_cents?: number
          realized_value_cents?: number
          remaining_value_cents?: number
          report_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_reason?: string | null
          rvpi?: number | null
          source_cutoff_at?: string
          status?: Database["public"]["Enums"]["report_status"]
          subperiods?: Json
          superseded_by_id?: string | null
          supersedes_id?: string | null
          total_value_cents?: number
          tvpi?: number | null
          twr_bps?: number | null
          twr_status?: string
          unfunded_commitment_cents?: number
          unrealized_gain_cents?: number
          updated_at?: string
          version?: number
        }
        Update: {
          allocation_run_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          beginning_nav_version_id?: string | null
          beginning_value_cents?: number
          benchmarks?: Json
          book_id?: string | null
          bridge?: Json
          carried_interest_cents?: number
          cash_flows?: Json
          contributions_cents?: number
          created_at?: string
          cumulative_return_bps?: number | null
          distributions_cents?: number
          dpi?: number | null
          ending_value_cents?: number
          exceptions?: Json
          expenses_cents?: number
          fund_type?: string
          gross_return_bps?: number | null
          id?: string
          inputs_snapshot?: Json
          investment_income_cents?: number
          investor_visible?: boolean
          irr_bps?: number | null
          irr_status?: string
          management_fees_cents?: number
          manager_note?: string | null
          manager_responded_at?: string | null
          manager_responded_by?: string | null
          manager_response?: string | null
          manager_visible?: boolean
          methodology_id?: string | null
          methodology_snapshot?: Json
          methodology_version?: string
          metrics?: Json
          moic?: number | null
          nav_version_id?: string | null
          net_return_bps?: number | null
          offering_id?: string
          overrides?: Json
          paid_in_capital_cents?: number
          period_end?: string
          period_kind?: string
          period_label?: string
          period_start?: string
          prepared_at?: string
          prepared_by?: string | null
          prior_run_id?: string | null
          published_at?: string | null
          published_by?: string | null
          realized_gain_cents?: number
          realized_value_cents?: number
          remaining_value_cents?: number
          report_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_reason?: string | null
          rvpi?: number | null
          source_cutoff_at?: string
          status?: Database["public"]["Enums"]["report_status"]
          subperiods?: Json
          superseded_by_id?: string | null
          supersedes_id?: string | null
          total_value_cents?: number
          tvpi?: number | null
          twr_bps?: number | null
          twr_status?: string
          unfunded_commitment_cents?: number
          unrealized_gain_cents?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_runs_allocation_run_id_fkey"
            columns: ["allocation_run_id"]
            isOneToOne: false
            referencedRelation: "allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_beginning_nav_version_id_fkey"
            columns: ["beginning_nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_methodology_id_fkey"
            columns: ["methodology_id"]
            isOneToOne: false
            referencedRelation: "performance_methodologies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_nav_version_id_fkey"
            columns: ["nav_version_id"]
            isOneToOne: false
            referencedRelation: "nav_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_prior_run_id_fkey"
            columns: ["prior_run_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      person_onboarding_events: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          detail: Json | null
          from_state: Database["public"]["Enums"]["onboarding_state"] | null
          id: string
          person_id: string
          reason: string | null
          to_state: Database["public"]["Enums"]["onboarding_state"]
        }
        Insert: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json | null
          from_state?: Database["public"]["Enums"]["onboarding_state"] | null
          id?: string
          person_id: string
          reason?: string | null
          to_state: Database["public"]["Enums"]["onboarding_state"]
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json | null
          from_state?: Database["public"]["Enums"]["onboarding_state"] | null
          id?: string
          person_id?: string
          reason?: string | null
          to_state?: Database["public"]["Enums"]["onboarding_state"]
        }
        Relationships: [
          {
            foreignKeyName: "person_onboarding_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          aml_screened_at: string | null
          aml_status: Database["public"]["Enums"]["check_status"]
          citizenship_country: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          id: string
          identity_verified_at: string | null
          kyc_status: Database["public"]["Enums"]["check_status"]
          kyc_verified_at: string | null
          legal_first_name: string | null
          legal_last_name: string | null
          legal_middle_name: string | null
          onboarding_reason: string | null
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          phone: string | null
          postal_code: string | null
          preferred_name: string | null
          region: string | null
          residence_country: string | null
          reverification_due_at: string | null
          tax_id_last4: string | null
          tax_id_reference: string | null
          tax_residency_country: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          aml_screened_at?: string | null
          aml_status?: Database["public"]["Enums"]["check_status"]
          citizenship_country?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          id?: string
          identity_verified_at?: string | null
          kyc_status?: Database["public"]["Enums"]["check_status"]
          kyc_verified_at?: string | null
          legal_first_name?: string | null
          legal_last_name?: string | null
          legal_middle_name?: string | null
          onboarding_reason?: string | null
          onboarding_state?: Database["public"]["Enums"]["onboarding_state"]
          phone?: string | null
          postal_code?: string | null
          preferred_name?: string | null
          region?: string | null
          residence_country?: string | null
          reverification_due_at?: string | null
          tax_id_last4?: string | null
          tax_id_reference?: string | null
          tax_residency_country?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          aml_screened_at?: string | null
          aml_status?: Database["public"]["Enums"]["check_status"]
          citizenship_country?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          id?: string
          identity_verified_at?: string | null
          kyc_status?: Database["public"]["Enums"]["check_status"]
          kyc_verified_at?: string | null
          legal_first_name?: string | null
          legal_last_name?: string | null
          legal_middle_name?: string | null
          onboarding_reason?: string | null
          onboarding_state?: Database["public"]["Enums"]["onboarding_state"]
          phone?: string | null
          postal_code?: string | null
          preferred_name?: string | null
          region?: string | null
          residence_country?: string | null
          reverification_due_at?: string | null
          tax_id_last4?: string | null
          tax_id_reference?: string | null
          tax_residency_country?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      portfolio_assets: {
        Row: {
          acquisition_date: string | null
          asset_class: Database["public"]["Enums"]["portfolio_asset_class"]
          asset_name: string
          book_id: string
          client_entity_id: string | null
          cost_basis_cents: number
          created_at: string
          created_by: string | null
          ct_company_id: string | null
          ct_security_id: string | null
          currency: string
          disposition_date: string | null
          disposition_note: string | null
          external_reference: string | null
          id: string
          instrument: string | null
          issuer_name: string
          note: string | null
          offering_id: string | null
          original_transaction_id: string | null
          original_transaction_table: string | null
          ownership_pct: number | null
          quantity: number | null
          realized_cost_basis_cents: number
          realized_gain_cents: number
          realized_proceeds_cents: number
          realized_quantity: number
          status: Database["public"]["Enums"]["portfolio_asset_status"]
          updated_at: string
        }
        Insert: {
          acquisition_date?: string | null
          asset_class?: Database["public"]["Enums"]["portfolio_asset_class"]
          asset_name: string
          book_id: string
          client_entity_id?: string | null
          cost_basis_cents?: number
          created_at?: string
          created_by?: string | null
          ct_company_id?: string | null
          ct_security_id?: string | null
          currency?: string
          disposition_date?: string | null
          disposition_note?: string | null
          external_reference?: string | null
          id?: string
          instrument?: string | null
          issuer_name: string
          note?: string | null
          offering_id?: string | null
          original_transaction_id?: string | null
          original_transaction_table?: string | null
          ownership_pct?: number | null
          quantity?: number | null
          realized_cost_basis_cents?: number
          realized_gain_cents?: number
          realized_proceeds_cents?: number
          realized_quantity?: number
          status?: Database["public"]["Enums"]["portfolio_asset_status"]
          updated_at?: string
        }
        Update: {
          acquisition_date?: string | null
          asset_class?: Database["public"]["Enums"]["portfolio_asset_class"]
          asset_name?: string
          book_id?: string
          client_entity_id?: string | null
          cost_basis_cents?: number
          created_at?: string
          created_by?: string | null
          ct_company_id?: string | null
          ct_security_id?: string | null
          currency?: string
          disposition_date?: string | null
          disposition_note?: string | null
          external_reference?: string | null
          id?: string
          instrument?: string | null
          issuer_name?: string
          note?: string | null
          offering_id?: string | null
          original_transaction_id?: string | null
          original_transaction_table?: string | null
          ownership_pct?: number | null
          quantity?: number | null
          realized_cost_basis_cents?: number
          realized_gain_cents?: number
          realized_proceeds_cents?: number
          realized_quantity?: number
          status?: Database["public"]["Enums"]["portfolio_asset_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_assets_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_assets_client_entity_id_fkey"
            columns: ["client_entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_assets_ct_company_id_fkey"
            columns: ["ct_company_id"]
            isOneToOne: false
            referencedRelation: "ct_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_assets_ct_security_id_fkey"
            columns: ["ct_security_id"]
            isOneToOne: false
            referencedRelation: "ct_securities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_assets_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_realizations: {
        Row: {
          asset_id: string
          bank_transaction_id: string | null
          book_id: string
          cost_basis_relieved_cents: number
          counterparty: string | null
          created_at: string
          disposition_date: string
          id: string
          is_full_disposition: boolean
          journal_entry_id: string | null
          note: string | null
          offering_id: string | null
          proceeds_cents: number
          quantity_sold: number | null
          realized_gain_cents: number
          recorded_by: string | null
          remaining_cost_basis_cents: number
          remaining_quantity: number | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          bank_transaction_id?: string | null
          book_id: string
          cost_basis_relieved_cents?: number
          counterparty?: string | null
          created_at?: string
          disposition_date: string
          id?: string
          is_full_disposition?: boolean
          journal_entry_id?: string | null
          note?: string | null
          offering_id?: string | null
          proceeds_cents?: number
          quantity_sold?: number | null
          realized_gain_cents?: number
          recorded_by?: string | null
          remaining_cost_basis_cents?: number
          remaining_quantity?: number | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          bank_transaction_id?: string | null
          book_id?: string
          cost_basis_relieved_cents?: number
          counterparty?: string | null
          created_at?: string
          disposition_date?: string
          id?: string
          is_full_disposition?: boolean
          journal_entry_id?: string | null
          note?: string | null
          offering_id?: string | null
          proceeds_cents?: number
          quantity_sold?: number | null
          realized_gain_cents?: number
          recorded_by?: string | null
          remaining_cost_basis_cents?: number
          remaining_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_realizations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_realizations_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_realizations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_realizations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_realizations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_valuations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          asset_id: string
          assumptions: string | null
          book_id: string
          change_cents: number
          change_pct: number | null
          conflicts: Json
          cost_basis_cents: number
          created_at: string
          currency: string
          decision_reason: string | null
          effective_at: string | null
          effective_date: string
          id: string
          inputs: Json
          journal_entry_id: string | null
          manager_acknowledged_at: string | null
          manager_acknowledged_by: string | null
          manager_challenge_note: string | null
          methodology: Database["public"]["Enums"]["valuation_method"]
          methodology_note: string | null
          note: string | null
          offering_id: string | null
          prepared_at: string
          prepared_by: string | null
          prepared_by_role: string | null
          price_per_unit_cents: number | null
          prior_valuation_id: string | null
          quantity: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          source_date: string | null
          source_type: Database["public"]["Enums"]["valuation_source_type"]
          status: Database["public"]["Enums"]["portfolio_valuation_status"]
          superseded_by_id: string | null
          supersedes_id: string | null
          updated_at: string
          valuation_date: string
          value_cents: number
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asset_id: string
          assumptions?: string | null
          book_id: string
          change_cents?: number
          change_pct?: number | null
          conflicts?: Json
          cost_basis_cents?: number
          created_at?: string
          currency?: string
          decision_reason?: string | null
          effective_at?: string | null
          effective_date: string
          id?: string
          inputs?: Json
          journal_entry_id?: string | null
          manager_acknowledged_at?: string | null
          manager_acknowledged_by?: string | null
          manager_challenge_note?: string | null
          methodology: Database["public"]["Enums"]["valuation_method"]
          methodology_note?: string | null
          note?: string | null
          offering_id?: string | null
          prepared_at?: string
          prepared_by?: string | null
          prepared_by_role?: string | null
          price_per_unit_cents?: number | null
          prior_valuation_id?: string | null
          quantity?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          source_date?: string | null
          source_type: Database["public"]["Enums"]["valuation_source_type"]
          status?: Database["public"]["Enums"]["portfolio_valuation_status"]
          superseded_by_id?: string | null
          supersedes_id?: string | null
          updated_at?: string
          valuation_date: string
          value_cents: number
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string
          assumptions?: string | null
          book_id?: string
          change_cents?: number
          change_pct?: number | null
          conflicts?: Json
          cost_basis_cents?: number
          created_at?: string
          currency?: string
          decision_reason?: string | null
          effective_at?: string | null
          effective_date?: string
          id?: string
          inputs?: Json
          journal_entry_id?: string | null
          manager_acknowledged_at?: string | null
          manager_acknowledged_by?: string | null
          manager_challenge_note?: string | null
          methodology?: Database["public"]["Enums"]["valuation_method"]
          methodology_note?: string | null
          note?: string | null
          offering_id?: string | null
          prepared_at?: string
          prepared_by?: string | null
          prepared_by_role?: string | null
          price_per_unit_cents?: number | null
          prior_valuation_id?: string | null
          quantity?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          source_date?: string | null
          source_type?: Database["public"]["Enums"]["valuation_source_type"]
          status?: Database["public"]["Enums"]["portfolio_valuation_status"]
          superseded_by_id?: string | null
          supersedes_id?: string | null
          updated_at?: string
          valuation_date?: string
          value_cents?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_valuations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_valuations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_valuations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_valuations_prior_valuation_id_fkey"
            columns: ["prior_valuation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_valuations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_valuations_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "portfolio_valuations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_valuations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "portfolio_valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      position_transfers: {
        Row: {
          approved_by: string | null
          authorization_document_path: string | null
          authorization_reference: string
          capital_cents: number
          commitment_cents: number
          created_at: string
          effective_date: string
          from_position_id: string
          id: string
          offering_id: string
          recorded_by: string | null
          status: string
          tax_basis_reference: string | null
          to_position_id: string
          units: number | null
        }
        Insert: {
          approved_by?: string | null
          authorization_document_path?: string | null
          authorization_reference: string
          capital_cents?: number
          commitment_cents?: number
          created_at?: string
          effective_date: string
          from_position_id: string
          id?: string
          offering_id: string
          recorded_by?: string | null
          status?: string
          tax_basis_reference?: string | null
          to_position_id: string
          units?: number | null
        }
        Update: {
          approved_by?: string | null
          authorization_document_path?: string | null
          authorization_reference?: string
          capital_cents?: number
          commitment_cents?: number
          created_at?: string
          effective_date?: string
          from_position_id?: string
          id?: string
          offering_id?: string
          recorded_by?: string | null
          status?: string
          tax_basis_reference?: string | null
          to_position_id?: string
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "position_transfers_from_position_id_fkey"
            columns: ["from_position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_transfers_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_transfers_to_position_id_fkey"
            columns: ["to_position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_rules: {
        Row: {
          approval_required: Database["public"]["Enums"]["reconciliation_approver"]
          approval_threshold_cents: number | null
          book_id: string | null
          counterparty_pattern: string | null
          created_at: string
          created_by: string | null
          credit_account_code: string
          debit_account_code: string
          direction: string
          effective_from: string
          id: string
          is_active: boolean
          materiality_threshold_cents: number
          max_amount_cents: number | null
          min_amount_cents: number | null
          name: string
          notes: string | null
          offering_id: string | null
          priority: number
          supersedes_id: string | null
          transaction_type: Database["public"]["Enums"]["cash_transaction_type"]
          updated_at: string
          version: number
        }
        Insert: {
          approval_required?: Database["public"]["Enums"]["reconciliation_approver"]
          approval_threshold_cents?: number | null
          book_id?: string | null
          counterparty_pattern?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_code: string
          debit_account_code: string
          direction?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          materiality_threshold_cents?: number
          max_amount_cents?: number | null
          min_amount_cents?: number | null
          name: string
          notes?: string | null
          offering_id?: string | null
          priority?: number
          supersedes_id?: string | null
          transaction_type: Database["public"]["Enums"]["cash_transaction_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          approval_required?: Database["public"]["Enums"]["reconciliation_approver"]
          approval_threshold_cents?: number | null
          book_id?: string | null
          counterparty_pattern?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_code?: string
          debit_account_code?: string
          direction?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          materiality_threshold_cents?: number
          max_amount_cents?: number | null
          min_amount_cents?: number | null
          name?: string
          notes?: string | null
          offering_id?: string | null
          priority?: number
          supersedes_id?: string | null
          transaction_type?: Database["public"]["Enums"]["cash_transaction_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "posting_rules_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_rules_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_rules_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "posting_rules"
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
      professional_credentials: {
        Row: {
          created_at: string
          credential_number: string | null
          credential_type: string
          expires_at: string | null
          fiduciary_capacity: string | null
          firm_identifier: string | null
          id: string
          issued_at: string | null
          jurisdiction: string | null
          organization_id: string | null
          review_note: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          credential_number?: string | null
          credential_type: string
          expires_at?: string | null
          fiduciary_capacity?: string | null
          firm_identifier?: string | null
          id?: string
          issued_at?: string | null
          jurisdiction?: string | null
          organization_id?: string | null
          review_note?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          credential_number?: string | null
          credential_type?: string
          expires_at?: string | null
          fiduciary_capacity?: string | null
          firm_identifier?: string | null
          id?: string
          issued_at?: string | null
          jurisdiction?: string | null
          organization_id?: string | null
          review_note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
            referencedColumns: ["id"]
          },
        ]
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
      professional_organization_documents: {
        Row: {
          created_at: string
          document_hash: string | null
          document_type: string
          expires_at: string | null
          file_name: string
          id: string
          organization_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_hash?: string | null
          document_type: string
          expires_at?: string | null
          file_name: string
          id?: string
          organization_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_hash?: string | null
          document_type?: string
          expires_at?: string | null
          file_name?: string
          id?: string
          organization_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_organization_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "professional_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_identifier: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          dba_name: string | null
          id: string
          jurisdiction: string | null
          legal_name: string | null
          license_number: string | null
          name: string
          notes: string | null
          org_type: Database["public"]["Enums"]["professional_org_type"]
          postal_code: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          region: string | null
          registration_number: string | null
          regulatory_identifiers: Json
          reverification_due_at: string | null
          status: string
          updated_at: string
          verification_note: string | null
          verification_status: string
          verification_submitted_at: string | null
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_identifier?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          dba_name?: string | null
          id?: string
          jurisdiction?: string | null
          legal_name?: string | null
          license_number?: string | null
          name: string
          notes?: string | null
          org_type?: Database["public"]["Enums"]["professional_org_type"]
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          region?: string | null
          registration_number?: string | null
          regulatory_identifiers?: Json
          reverification_due_at?: string | null
          status?: string
          updated_at?: string
          verification_note?: string | null
          verification_status?: string
          verification_submitted_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_identifier?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          dba_name?: string | null
          id?: string
          jurisdiction?: string | null
          legal_name?: string | null
          license_number?: string | null
          name?: string
          notes?: string | null
          org_type?: Database["public"]["Enums"]["professional_org_type"]
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          region?: string | null
          registration_number?: string | null
          regulatory_identifiers?: Json
          reverification_due_at?: string | null
          status?: string
          updated_at?: string
          verification_note?: string | null
          verification_status?: string
          verification_submitted_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      profile_accreditations: {
        Row: {
          basis: string | null
          created_at: string
          evidence: Json
          expires_at: string | null
          id: string
          legacy_record_id: string | null
          offering_id: string | null
          profile_id: string
          status: Database["public"]["Enums"]["check_status"]
          updated_at: string
          verification_method: string | null
          verified_at: string | null
          verifier_kind: string | null
          verifier_name: string | null
        }
        Insert: {
          basis?: string | null
          created_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          legacy_record_id?: string | null
          offering_id?: string | null
          profile_id: string
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
          verification_method?: string | null
          verified_at?: string | null
          verifier_kind?: string | null
          verifier_name?: string | null
        }
        Update: {
          basis?: string | null
          created_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          legacy_record_id?: string | null
          offering_id?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
          verification_method?: string | null
          verified_at?: string | null
          verifier_kind?: string | null
          verifier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_accreditations_legacy_record_id_fkey"
            columns: ["legacy_record_id"]
            isOneToOne: false
            referencedRelation: "accreditation_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_accreditations_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_accreditations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      reconciliation_events: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          bank_transaction_id: string | null
          created_at: string
          from_status: string | null
          id: string
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
          reconciliation_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          bank_transaction_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          reconciliation_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          bank_transaction_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          reconciliation_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_events_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "bank_reconciliations"
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
      report_exceptions: {
        Row: {
          book_id: string | null
          context: Json
          created_at: string
          detail: string
          id: string
          kind: string
          offering_id: string | null
          period_end: string | null
          report_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          book_id?: string | null
          context?: Json
          created_at?: string
          detail: string
          id?: string
          kind: string
          offering_id?: string | null
          period_end?: string | null
          report_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          book_id?: string | null
          context?: Json
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          offering_id?: string | null
          period_end?: string | null
          report_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exceptions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exceptions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exceptions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_lines: {
        Row: {
          account_codes: Json
          amount_cents: number
          comparative_cents: number | null
          created_at: string
          id: string
          is_total: boolean
          label: string
          line_key: string
          provenance: Json
          report_id: string
          section: string | null
          sort_order: number
          statement: string
        }
        Insert: {
          account_codes?: Json
          amount_cents?: number
          comparative_cents?: number | null
          created_at?: string
          id?: string
          is_total?: boolean
          label: string
          line_key: string
          provenance?: Json
          report_id: string
          section?: string | null
          sort_order?: number
          statement: string
        }
        Update: {
          account_codes?: Json
          amount_cents?: number
          comparative_cents?: number | null
          created_at?: string
          id?: string
          is_total?: boolean
          label?: string
          line_key?: string
          provenance?: Json
          report_id?: string
          section?: string | null
          sort_order?: number
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_package_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audience: string
          book_id: string | null
          created_at: string
          id: string
          manifest: Json
          offering_id: string | null
          package_id: string | null
          period_end: string
          period_start: string | null
          prepared_at: string | null
          prepared_by: string | null
          published_at: string | null
          published_by: string | null
          report_ids: Json
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audience?: string
          book_id?: string | null
          created_at?: string
          id?: string
          manifest?: Json
          offering_id?: string | null
          package_id?: string | null
          period_end: string
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          report_ids?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audience?: string
          book_id?: string | null
          created_at?: string
          id?: string
          manifest?: Json
          offering_id?: string | null
          package_id?: string | null
          period_end?: string
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          report_ids?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_package_runs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_package_runs_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_package_runs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "report_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      report_packages: {
        Row: {
          audience: string
          book_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          items: Json
          name: string
          offering_id: string | null
          package_type: string
          updated_at: string
          version: number
        }
        Insert: {
          audience?: string
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          items?: Json
          name: string
          offering_id?: string | null
          package_type?: string
          updated_at?: string
          version?: number
        }
        Update: {
          audience?: string
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          items?: Json
          name?: string
          offering_id?: string | null
          package_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_packages_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_delivery_events: {
        Row: {
          actor_user_id: string | null
          channel: string
          created_at: string
          delegation_id: string | null
          detail: Json
          event: string
          id: string
          investor_user_id: string | null
          notice_id: string | null
          offering_id: string | null
          on_behalf_of: boolean
          package_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          channel?: string
          created_at?: string
          delegation_id?: string | null
          detail?: Json
          event: string
          id?: string
          investor_user_id?: string | null
          notice_id?: string | null
          offering_id?: string | null
          on_behalf_of?: boolean
          package_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          channel?: string
          created_at?: string
          delegation_id?: string | null
          detail?: Json
          event?: string
          id?: string
          investor_user_id?: string | null
          notice_id?: string | null
          offering_id?: string | null
          on_behalf_of?: boolean
          package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reporting_delivery_events_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "investor_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporting_delivery_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporting_delivery_events_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "investor_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_package_templates: {
        Row: {
          branding: Json
          code: string
          created_at: string
          created_by: string | null
          frequency: string
          fund_type: string | null
          id: string
          investor_class_id: string | null
          is_active: boolean
          name: string
          offering_id: string | null
          portfolio_detail: string
          required_components: Json
          sections: Json
          updated_at: string
          version: number
        }
        Insert: {
          branding?: Json
          code: string
          created_at?: string
          created_by?: string | null
          frequency?: string
          fund_type?: string | null
          id?: string
          investor_class_id?: string | null
          is_active?: boolean
          name: string
          offering_id?: string | null
          portfolio_detail?: string
          required_components?: Json
          sections?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          branding?: Json
          code?: string
          created_at?: string
          created_by?: string | null
          frequency?: string
          fund_type?: string | null
          id?: string
          investor_class_id?: string | null
          is_active?: boolean
          name?: string
          offering_id?: string | null
          portfolio_detail?: string
          required_components?: Json
          sections?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reporting_package_templates_offering_id_fkey"
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
      state_tax_returns: {
        Row: {
          created_at: string
          federal_return_id: string | null
          filing_status_code: string
          household_id: string | null
          id: string
          jurisdiction: string
          notes: string | null
          offering_id: string | null
          partnership_return_id: string | null
          residency: string | null
          source_income: Json
          state_withholding_cents: number
          status: string
          tax_year: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          federal_return_id?: string | null
          filing_status_code?: string
          household_id?: string | null
          id?: string
          jurisdiction: string
          notes?: string | null
          offering_id?: string | null
          partnership_return_id?: string | null
          residency?: string | null
          source_income?: Json
          state_withholding_cents?: number
          status?: string
          tax_year: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          federal_return_id?: string | null
          filing_status_code?: string
          household_id?: string | null
          id?: string
          jurisdiction?: string
          notes?: string | null
          offering_id?: string | null
          partnership_return_id?: string | null
          residency?: string | null
          source_income?: Json
          state_withholding_cents?: number
          status?: string
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_tax_returns_federal_return_id_fkey"
            columns: ["federal_return_id"]
            isOneToOne: false
            referencedRelation: "individual_tax_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_tax_returns_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "taxpayer_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_tax_returns_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_tax_returns_partnership_return_id_fkey"
            columns: ["partnership_return_id"]
            isOneToOne: false
            referencedRelation: "partnership_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_mapping_versions: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          basis: string
          book_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string | null
          id: string
          label: string
          lines: Json
          offering_id: string | null
          presentation: Json
          retired_at: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          basis?: string
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          id?: string
          label?: string
          lines?: Json
          offering_id?: string | null
          presentation?: Json
          retired_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          basis?: string
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          id?: string
          label?: string
          lines?: Json
          offering_id?: string | null
          presentation?: Json
          retired_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "statement_mapping_versions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_mapping_versions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      stepup_authentications: {
        Row: {
          action: string
          attempts: number
          challenge_reference: string | null
          consumed_at: string | null
          created_at: string
          delegation_id: string | null
          expires_at: string
          id: string
          ip_address: string | null
          method: string
          resource_id: string | null
          resource_type: string | null
          session_reference: string | null
          status: string
          user_agent: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          action: string
          attempts?: number
          challenge_reference?: string | null
          consumed_at?: string | null
          created_at?: string
          delegation_id?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          method: string
          resource_id?: string | null
          resource_type?: string | null
          session_reference?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          action?: string
          attempts?: number
          challenge_reference?: string | null
          consumed_at?: string | null
          created_at?: string
          delegation_id?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          method?: string
          resource_id?: string | null
          resource_type?: string | null
          session_reference?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
          verified_at?: string | null
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
      tax_access_events: {
        Row: {
          action: string
          actor_user_id: string
          allowed: boolean
          capability: string | null
          created_at: string
          delegation_id: string | null
          id: string
          on_behalf_of: string | null
          reason: string | null
          resource_id: string | null
          resource_table: string
        }
        Insert: {
          action: string
          actor_user_id: string
          allowed?: boolean
          capability?: string | null
          created_at?: string
          delegation_id?: string | null
          id?: string
          on_behalf_of?: string | null
          reason?: string | null
          resource_id?: string | null
          resource_table: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          allowed?: boolean
          capability?: string | null
          created_at?: string
          delegation_id?: string | null
          id?: string
          on_behalf_of?: string | null
          reason?: string | null
          resource_id?: string | null
          resource_table?: string
        }
        Relationships: []
      }
      tax_allocation_lines: {
        Row: {
          amount_cents: number
          basis: Json
          created_at: string
          id: string
          investment_profile_id: string | null
          investor_user_id: string | null
          item_code: string
          item_label: string | null
          k1_box: string | null
          offering_id: string
          ownership_pct: number | null
          position_id: string | null
          run_id: string
        }
        Insert: {
          amount_cents?: number
          basis?: Json
          created_at?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          item_code: string
          item_label?: string | null
          k1_box?: string | null
          offering_id: string
          ownership_pct?: number | null
          position_id?: string | null
          run_id: string
        }
        Update: {
          amount_cents?: number
          basis?: Json
          created_at?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          item_code?: string
          item_label?: string | null
          k1_box?: string | null
          offering_id?: string
          ownership_pct?: number | null
          position_id?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_allocation_lines_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocation_lines_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocation_lines_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocation_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tax_allocation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_allocation_runs: {
        Row: {
          allocated_totals: Json
          approved_at: string | null
          approved_by: string | null
          created_at: string
          difference_cents: number
          entity_totals: Json
          exceptions: Json
          finalized_at: string | null
          finalized_by: string | null
          id: string
          inputs_snapshot: Json
          methodology_code: string
          methodology_snapshot: Json
          methodology_version: number
          offering_id: string
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          supersedes_id: string | null
          tax_year: number
          tax_year_id: string
          updated_at: string
          version: number
        }
        Insert: {
          allocated_totals?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          difference_cents?: number
          entity_totals?: Json
          exceptions?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inputs_snapshot?: Json
          methodology_code: string
          methodology_snapshot?: Json
          methodology_version?: number
          offering_id: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supersedes_id?: string | null
          tax_year: number
          tax_year_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          allocated_totals?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          difference_cents?: number
          entity_totals?: Json
          exceptions?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inputs_snapshot?: Json
          methodology_code?: string
          methodology_snapshot?: Json
          methodology_version?: number
          offering_id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supersedes_id?: string | null
          tax_year?: number
          tax_year_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_allocation_runs_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocation_runs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "tax_allocation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocation_runs_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_allocations: {
        Row: {
          allocation_method: string
          approved_at: string | null
          approved_by: string | null
          book_id: string
          capital_account_id: string | null
          created_at: string
          dividend_income_cents: number
          expenses_cents: number
          filing_id: string | null
          id: string
          interest_income_cents: number
          investment_profile_id: string | null
          investor_user_id: string | null
          long_term_gain_cents: number
          ordinary_income_cents: number
          other_items: Json
          prepared_by: string | null
          short_term_gain_cents: number
          status: Database["public"]["Enums"]["tax_workflow_status"]
          tax_year: number
          updated_at: string
          withholding_cents: number
        }
        Insert: {
          allocation_method?: string
          approved_at?: string | null
          approved_by?: string | null
          book_id: string
          capital_account_id?: string | null
          created_at?: string
          dividend_income_cents?: number
          expenses_cents?: number
          filing_id?: string | null
          id?: string
          interest_income_cents?: number
          investment_profile_id?: string | null
          investor_user_id?: string | null
          long_term_gain_cents?: number
          ordinary_income_cents?: number
          other_items?: Json
          prepared_by?: string | null
          short_term_gain_cents?: number
          status?: Database["public"]["Enums"]["tax_workflow_status"]
          tax_year: number
          updated_at?: string
          withholding_cents?: number
        }
        Update: {
          allocation_method?: string
          approved_at?: string | null
          approved_by?: string | null
          book_id?: string
          capital_account_id?: string | null
          created_at?: string
          dividend_income_cents?: number
          expenses_cents?: number
          filing_id?: string | null
          id?: string
          interest_income_cents?: number
          investment_profile_id?: string | null
          investor_user_id?: string | null
          long_term_gain_cents?: number
          ordinary_income_cents?: number
          other_items?: Json
          prepared_by?: string | null
          short_term_gain_cents?: number
          status?: Database["public"]["Enums"]["tax_workflow_status"]
          tax_year?: number
          updated_at?: string
          withholding_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_allocations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocations_capital_account_id_fkey"
            columns: ["capital_account_id"]
            isOneToOne: false
            referencedRelation: "capital_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocations_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "tax_filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allocations_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_classification_records: {
        Row: {
          classification: string
          created_at: string
          effective_from: string
          effective_to: string | null
          evidence: Json
          id: string
          investment_profile_id: string | null
          is_foreign: boolean
          note: string | null
          person_id: string | null
          recorded_by: string | null
          residency_country: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          sub_classification: string | null
          subject_user_id: string | null
          supersedes_id: string | null
          treaty_country: string | null
          treaty_rate_bps: number | null
          updated_at: string
          version: number
        }
        Insert: {
          classification: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          evidence?: Json
          id?: string
          investment_profile_id?: string | null
          is_foreign?: boolean
          note?: string | null
          person_id?: string | null
          recorded_by?: string | null
          residency_country?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          sub_classification?: string | null
          subject_user_id?: string | null
          supersedes_id?: string | null
          treaty_country?: string | null
          treaty_rate_bps?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          classification?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          evidence?: Json
          id?: string
          investment_profile_id?: string | null
          is_foreign?: boolean
          note?: string | null
          person_id?: string | null
          recorded_by?: string | null
          residency_country?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          sub_classification?: string | null
          subject_user_id?: string | null
          supersedes_id?: string | null
          treaty_country?: string | null
          treaty_rate_bps?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_classification_records_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_classification_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_classification_records_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "tax_classification_records"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_document_records: {
        Row: {
          certification_date: string | null
          classification: string | null
          created_at: string
          effective_from: string | null
          expires_on: string | null
          form_type: string
          id: string
          investment_profile_id: string | null
          is_substitute: boolean
          offering_id: string | null
          person_id: string | null
          received_date: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string | null
          subject_user_id: string | null
          supersedes_id: string | null
          tin_last4: string | null
          tin_on_file: boolean
          tin_type: string | null
          updated_at: string
          uploaded_by: string | null
          validation_notes: string | null
          validation_status: string
          version: number
        }
        Insert: {
          certification_date?: string | null
          classification?: string | null
          created_at?: string
          effective_from?: string | null
          expires_on?: string | null
          form_type: string
          id?: string
          investment_profile_id?: string | null
          is_substitute?: boolean
          offering_id?: string | null
          person_id?: string | null
          received_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string | null
          subject_user_id?: string | null
          supersedes_id?: string | null
          tin_last4?: string | null
          tin_on_file?: boolean
          tin_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validation_notes?: string | null
          validation_status?: string
          version?: number
        }
        Update: {
          certification_date?: string | null
          classification?: string | null
          created_at?: string
          effective_from?: string | null
          expires_on?: string | null
          form_type?: string
          id?: string
          investment_profile_id?: string | null
          is_substitute?: boolean
          offering_id?: string | null
          person_id?: string | null
          received_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string | null
          subject_user_id?: string | null
          supersedes_id?: string | null
          tin_last4?: string | null
          tin_on_file?: boolean
          tin_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validation_notes?: string | null
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_document_records_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_records_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_document_records_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "tax_document_records"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delegation_id: string | null
          detail: Json
          event: string
          from_status: string | null
          household_id: string | null
          id: string
          offering_id: string | null
          on_behalf_of: string | null
          subject_id: string
          subject_table: string
          tax_year: number | null
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delegation_id?: string | null
          detail?: Json
          event: string
          from_status?: string | null
          household_id?: string | null
          id?: string
          offering_id?: string | null
          on_behalf_of?: string | null
          subject_id: string
          subject_table: string
          tax_year?: number | null
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delegation_id?: string | null
          detail?: Json
          event?: string
          from_status?: string | null
          household_id?: string | null
          id?: string
          offering_id?: string | null
          on_behalf_of?: string | null
          subject_id?: string
          subject_table?: string
          tax_year?: number | null
          to_status?: string | null
        }
        Relationships: []
      }
      tax_filings: {
        Row: {
          accounting_closed: boolean
          allocations_status: Database["public"]["Enums"]["tax_workflow_status"]
          approved_by: string | null
          book_id: string
          client_entity_id: string | null
          created_at: string
          delivery_status: Database["public"]["Enums"]["tax_workflow_status"]
          filed_at: string | null
          filed_by: string | null
          filing_status: Database["public"]["Enums"]["tax_workflow_status"]
          form_type: string
          id: string
          note: string | null
          offering_id: string | null
          period_id: string | null
          preparation_status: Database["public"]["Enums"]["tax_workflow_status"]
          prepared_by: string | null
          reviewed_by: string | null
          tax_year: number
          updated_at: string
        }
        Insert: {
          accounting_closed?: boolean
          allocations_status?: Database["public"]["Enums"]["tax_workflow_status"]
          approved_by?: string | null
          book_id: string
          client_entity_id?: string | null
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["tax_workflow_status"]
          filed_at?: string | null
          filed_by?: string | null
          filing_status?: Database["public"]["Enums"]["tax_workflow_status"]
          form_type: string
          id?: string
          note?: string | null
          offering_id?: string | null
          period_id?: string | null
          preparation_status?: Database["public"]["Enums"]["tax_workflow_status"]
          prepared_by?: string | null
          reviewed_by?: string | null
          tax_year: number
          updated_at?: string
        }
        Update: {
          accounting_closed?: boolean
          allocations_status?: Database["public"]["Enums"]["tax_workflow_status"]
          approved_by?: string | null
          book_id?: string
          client_entity_id?: string | null
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["tax_workflow_status"]
          filed_at?: string | null
          filed_by?: string | null
          filing_status?: Database["public"]["Enums"]["tax_workflow_status"]
          form_type?: string
          id?: string
          note?: string | null
          offering_id?: string | null
          period_id?: string | null
          preparation_status?: Database["public"]["Enums"]["tax_workflow_status"]
          prepared_by?: string | null
          reviewed_by?: string | null
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_filings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filings_client_entity_id_fkey"
            columns: ["client_entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filings_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_forms: {
        Row: {
          allocation_id: string | null
          amends_form_id: string | null
          approved_by: string | null
          book_id: string
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          delivery_status: Database["public"]["Enums"]["tax_workflow_status"]
          document_id: string | null
          filing_id: string | null
          filing_status: Database["public"]["Enums"]["tax_workflow_status"]
          form_type: string
          id: string
          investment_profile_id: string | null
          investor_user_id: string | null
          is_amended: boolean
          offering_id: string | null
          payload: Json
          preparation_status: Database["public"]["Enums"]["tax_workflow_status"]
          prepared_by: string | null
          reviewed_by: string | null
          storage_path: string | null
          tax_year: number
          updated_at: string
          version: number
        }
        Insert: {
          allocation_id?: string | null
          amends_form_id?: string | null
          approved_by?: string | null
          book_id: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_status?: Database["public"]["Enums"]["tax_workflow_status"]
          document_id?: string | null
          filing_id?: string | null
          filing_status?: Database["public"]["Enums"]["tax_workflow_status"]
          form_type: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          is_amended?: boolean
          offering_id?: string | null
          payload?: Json
          preparation_status?: Database["public"]["Enums"]["tax_workflow_status"]
          prepared_by?: string | null
          reviewed_by?: string | null
          storage_path?: string | null
          tax_year: number
          updated_at?: string
          version?: number
        }
        Update: {
          allocation_id?: string | null
          amends_form_id?: string | null
          approved_by?: string | null
          book_id?: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_status?: Database["public"]["Enums"]["tax_workflow_status"]
          document_id?: string | null
          filing_id?: string | null
          filing_status?: Database["public"]["Enums"]["tax_workflow_status"]
          form_type?: string
          id?: string
          investment_profile_id?: string | null
          investor_user_id?: string | null
          is_amended?: boolean
          offering_id?: string | null
          payload?: Json
          preparation_status?: Database["public"]["Enums"]["tax_workflow_status"]
          prepared_by?: string | null
          reviewed_by?: string | null
          storage_path?: string | null
          tax_year?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_forms_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "tax_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_amends_form_id_fkey"
            columns: ["amends_form_id"]
            isOneToOne: false
            referencedRelation: "tax_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fund_tax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "tax_filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_forms_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_provider_exchanges: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          operation: string
          payload: Json
          provider: string
          provider_reference: string | null
          provider_status: string | null
          subject_id: string
          subject_table: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          operation: string
          payload?: Json
          provider?: string
          provider_reference?: string | null
          provider_status?: string | null
          subject_id: string
          subject_table: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          operation?: string
          payload?: Json
          provider?: string
          provider_reference?: string | null
          provider_status?: string | null
          subject_id?: string
          subject_table?: string
        }
        Relationships: []
      }
      tax_return_lines: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          line_code: string
          line_label: string | null
          provenance: Json
          return_id: string
          schedule_code: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          line_code: string
          line_label?: string | null
          provenance?: Json
          return_id: string
          schedule_code: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          line_code?: string
          line_label?: string | null
          provenance?: Json
          return_id?: string
          schedule_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "individual_tax_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_workpapers: {
        Row: {
          content: Json
          created_at: string
          exceptions: Json
          household_id: string | null
          id: string
          kind: string
          offering_id: string | null
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          support: Json
          tax_year: number
          tax_year_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          exceptions?: Json
          household_id?: string | null
          id?: string
          kind: string
          offering_id?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          support?: Json
          tax_year: number
          tax_year_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          exceptions?: Json
          household_id?: string | null
          id?: string
          kind?: string
          offering_id?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          support?: Json
          tax_year?: number
          tax_year_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_workpapers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "taxpayer_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_workpapers_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_workpapers_tax_year_id_fkey"
            columns: ["tax_year_id"]
            isOneToOne: false
            referencedRelation: "tax_years"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_years: {
        Row: {
          created_at: string
          ein_last4: string | null
          entity_id: string | null
          exceptions: Json
          household_id: string | null
          id: string
          offering_id: string | null
          opened_by: string | null
          period_end: string | null
          period_start: string | null
          readiness: Json
          scope: string
          status: string
          tax_year: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          ein_last4?: string | null
          entity_id?: string | null
          exceptions?: Json
          household_id?: string | null
          id?: string
          offering_id?: string | null
          opened_by?: string | null
          period_end?: string | null
          period_start?: string | null
          readiness?: Json
          scope: string
          status?: string
          tax_year: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          ein_last4?: string | null
          entity_id?: string | null
          exceptions?: Json
          household_id?: string | null
          id?: string
          offering_id?: string | null
          opened_by?: string | null
          period_end?: string | null
          period_start?: string | null
          readiness?: Json
          scope?: string
          status?: string
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_years_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      taxpayer_household_members: {
        Row: {
          access_authorized: boolean
          access_authorized_at: string | null
          access_authorized_by: string | null
          created_at: string
          filing_status: string | null
          household_id: string
          id: string
          member_user_id: string | null
          person_id: string | null
          relationship: string
          tax_year: number
          updated_at: string
        }
        Insert: {
          access_authorized?: boolean
          access_authorized_at?: string | null
          access_authorized_by?: string | null
          created_at?: string
          filing_status?: string | null
          household_id: string
          id?: string
          member_user_id?: string | null
          person_id?: string | null
          relationship: string
          tax_year: number
          updated_at?: string
        }
        Update: {
          access_authorized?: boolean
          access_authorized_at?: string | null
          access_authorized_by?: string | null
          created_at?: string
          filing_status?: string | null
          household_id?: string
          id?: string
          member_user_id?: string | null
          person_id?: string | null
          relationship?: string
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxpayer_household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "taxpayer_households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxpayer_household_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      taxpayer_households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          primary_person_id: string | null
          primary_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          primary_person_id?: string | null
          primary_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          primary_person_id?: string | null
          primary_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxpayer_households_primary_person_id_fkey"
            columns: ["primary_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
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
      valuation_events: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          asset_id: string | null
          created_at: string
          from_status: string | null
          id: string
          new_value: Json | null
          offering_id: string | null
          previous_value: Json | null
          reason: string | null
          to_status: string | null
          valuation_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          asset_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          new_value?: Json | null
          offering_id?: string | null
          previous_value?: Json | null
          reason?: string | null
          to_status?: string | null
          valuation_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          asset_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          new_value?: Json | null
          offering_id?: string | null
          previous_value?: Json | null
          reason?: string | null
          to_status?: string | null
          valuation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "valuation_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_events_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_events_valuation_id_fkey"
            columns: ["valuation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_evidence: {
        Row: {
          asset_id: string
          content_hash: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["valuation_evidence_kind"]
          offering_id: string | null
          storage_bucket: string
          storage_path: string | null
          structured: Json
          supersedes_id: string | null
          title: string
          uploaded_at: string
          uploaded_by: string | null
          valuation_id: string
          version: number
        }
        Insert: {
          asset_id: string
          content_hash?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["valuation_evidence_kind"]
          offering_id?: string | null
          storage_bucket?: string
          storage_path?: string | null
          structured?: Json
          supersedes_id?: string | null
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
          valuation_id: string
          version?: number
        }
        Update: {
          asset_id?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["valuation_evidence_kind"]
          offering_id?: string | null
          storage_bucket?: string
          storage_path?: string | null
          structured?: Json
          supersedes_id?: string | null
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
          valuation_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "valuation_evidence_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_evidence_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_evidence_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "valuation_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_evidence_valuation_id_fkey"
            columns: ["valuation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_policies: {
        Row: {
          asset_class:
            | Database["public"]["Enums"]["portfolio_asset_class"]
            | null
          book_id: string | null
          cash_account_code: string
          cost_account_code: string
          created_at: string
          created_by: string | null
          decrease_threshold_pct: number
          evidence_required: boolean
          id: string
          increase_threshold_pct: number
          investment_account_code: string
          is_active: boolean
          manager_may_approve: boolean
          manager_review_required: boolean
          material_change_cents: number
          offering_id: string | null
          realized_account_code: string
          source_priority: Json
          staleness_days: number
          supersedes_id: string | null
          unrealized_account_code: string
          unrealized_policy_enabled: boolean
          updated_at: string
          version: number
        }
        Insert: {
          asset_class?:
            | Database["public"]["Enums"]["portfolio_asset_class"]
            | null
          book_id?: string | null
          cash_account_code?: string
          cost_account_code?: string
          created_at?: string
          created_by?: string | null
          decrease_threshold_pct?: number
          evidence_required?: boolean
          id?: string
          increase_threshold_pct?: number
          investment_account_code?: string
          is_active?: boolean
          manager_may_approve?: boolean
          manager_review_required?: boolean
          material_change_cents?: number
          offering_id?: string | null
          realized_account_code?: string
          source_priority?: Json
          staleness_days?: number
          supersedes_id?: string | null
          unrealized_account_code?: string
          unrealized_policy_enabled?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          asset_class?:
            | Database["public"]["Enums"]["portfolio_asset_class"]
            | null
          book_id?: string | null
          cash_account_code?: string
          cost_account_code?: string
          created_at?: string
          created_by?: string | null
          decrease_threshold_pct?: number
          evidence_required?: boolean
          id?: string
          increase_threshold_pct?: number
          investment_account_code?: string
          is_active?: boolean
          manager_may_approve?: boolean
          manager_review_required?: boolean
          material_change_cents?: number
          offering_id?: string | null
          realized_account_code?: string
          source_priority?: Json
          staleness_days?: number
          supersedes_id?: string | null
          unrealized_account_code?: string
          unrealized_policy_enabled?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "valuation_policies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_policies_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_policies_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "valuation_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      waterfall_terms: {
        Row: {
          carry_pct: number
          catch_up_pct: number
          class_id: string | null
          clawback_tracked: boolean
          compounding: string
          created_at: string
          documented_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          offering_id: string
          preferred_return_bps: number
          return_of_capital_first: boolean
          structure: string
          tiers: Json
          updated_at: string
          version: number
        }
        Insert: {
          carry_pct?: number
          catch_up_pct?: number
          class_id?: string | null
          clawback_tracked?: boolean
          compounding?: string
          created_at?: string
          documented_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          offering_id: string
          preferred_return_bps?: number
          return_of_capital_first?: boolean
          structure?: string
          tiers?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          carry_pct?: number
          catch_up_pct?: number
          class_id?: string | null
          clawback_tracked?: boolean
          compounding?: string
          created_at?: string
          documented_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          offering_id?: string
          preferred_return_bps?: number
          return_of_capital_first?: boolean
          structure?: string
          tiers?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "waterfall_terms_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "investor_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waterfall_terms_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
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
      withholding_records: {
        Row: {
          amount_withheld_cents: number
          authority_reference: string | null
          book_id: string
          classification: string | null
          created_at: string
          dedupe_key: string | null
          deposited_at: string | null
          documentation_form: Database["public"]["Enums"]["tax_documentation_form"]
          exceptions: Json
          exemption_code: string | null
          form_id: string | null
          gross_amount_cents: number
          id: string
          income_code: string | null
          income_type: string
          investment_profile_id: string | null
          journal_entry_id: string | null
          offering_id: string | null
          position_id: string | null
          rate_basis: string
          recipient_user_id: string | null
          recorded_by: string | null
          reviewed_by: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["tax_workflow_status"]
          tax_document_id: string | null
          tax_profile_id: string | null
          tax_residency_country: string | null
          tax_year: number
          updated_at: string
          withholding_classification: string
          withholding_rate_bps: number
        }
        Insert: {
          amount_withheld_cents?: number
          authority_reference?: string | null
          book_id: string
          classification?: string | null
          created_at?: string
          dedupe_key?: string | null
          deposited_at?: string | null
          documentation_form?: Database["public"]["Enums"]["tax_documentation_form"]
          exceptions?: Json
          exemption_code?: string | null
          form_id?: string | null
          gross_amount_cents?: number
          id?: string
          income_code?: string | null
          income_type?: string
          investment_profile_id?: string | null
          journal_entry_id?: string | null
          offering_id?: string | null
          position_id?: string | null
          rate_basis?: string
          recipient_user_id?: string | null
          recorded_by?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["tax_workflow_status"]
          tax_document_id?: string | null
          tax_profile_id?: string | null
          tax_residency_country?: string | null
          tax_year: number
          updated_at?: string
          withholding_classification?: string
          withholding_rate_bps?: number
        }
        Update: {
          amount_withheld_cents?: number
          authority_reference?: string | null
          book_id?: string
          classification?: string | null
          created_at?: string
          dedupe_key?: string | null
          deposited_at?: string | null
          documentation_form?: Database["public"]["Enums"]["tax_documentation_form"]
          exceptions?: Json
          exemption_code?: string | null
          form_id?: string | null
          gross_amount_cents?: number
          id?: string
          income_code?: string | null
          income_type?: string
          investment_profile_id?: string | null
          journal_entry_id?: string | null
          offering_id?: string | null
          position_id?: string | null
          rate_basis?: string
          recipient_user_id?: string | null
          recorded_by?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["tax_workflow_status"]
          tax_document_id?: string | null
          tax_profile_id?: string | null
          tax_residency_country?: string | null
          tax_year?: number
          updated_at?: string
          withholding_classification?: string
          withholding_rate_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "withholding_records_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "ledger_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "tax_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_investment_profile_id_fkey"
            columns: ["investment_profile_id"]
            isOneToOne: false
            referencedRelation: "investment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "investor_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_tax_document_id_fkey"
            columns: ["tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_document_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_records_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "investor_tax_profiles"
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
      consume_signing_stepup: {
        Args: {
          p_action: string
          p_delegation_id: string
          p_id: string
          p_resource_id: string
          p_resource_type: string
          p_user_id: string
        }
        Returns: {
          action: string
          attempts: number
          challenge_reference: string | null
          consumed_at: string | null
          created_at: string
          delegation_id: string | null
          expires_at: string
          id: string
          ip_address: string | null
          method: string
          resource_id: string | null
          resource_type: string | null
          session_reference: string | null
          status: string
          user_agent: string | null
          user_id: string
          verified_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "stepup_authentications"
          isOneToOne: false
          isSetofReturn: true
        }
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
      fund_setup_manager: { Args: { _setup_id: string }; Returns: boolean }
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
      register_stepup_attempt: {
        Args: { p_id: string; p_max: number; p_user_id: string }
        Returns: number
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
      accounting_exception_kind:
        | "unmatched_cash"
        | "duplicate_candidate"
        | "suspected_duplicate"
        | "amount_mismatch"
        | "account_mismatch"
        | "unknown_counterparty"
        | "missing_investor"
        | "missing_fund"
        | "missing_accounting_mapping"
        | "closed_period_transaction"
        | "inconsistent_currency"
        | "reconciliation_conflict"
        | "posting_failure"
        | "stale_valuation"
        | "missing_valuation_source"
        | "missing_valuation_methodology"
        | "unsupported_valuation_change"
        | "valuation_change_threshold"
        | "missing_quantity"
        | "missing_cost_basis"
        | "impossible_valuation"
        | "conflicting_valuation_sources"
        | "missing_valuation_evidence"
      accounting_exception_status:
        | "open"
        | "investigating"
        | "resolved"
        | "waived"
      accounting_period_status:
        | "open"
        | "soft_closed"
        | "review"
        | "closed"
        | "locked"
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
      assisted_draft_status:
        | "awaiting_client_review"
        | "approved"
        | "rejected"
        | "changes_requested"
        | "withdrawn"
      assisted_draft_type:
        | "profile_contact"
        | "entity_information"
        | "ownership_information"
        | "investment_questionnaire"
        | "kyc_support"
        | "kyb_support"
        | "accreditation"
        | "investment"
      cash_transaction_type:
        | "investor_contribution"
        | "capital_call"
        | "subscription_receipt"
        | "distribution"
        | "management_fee"
        | "fund_expense"
        | "organizational_expense"
        | "portfolio_investment"
        | "investment_proceeds"
        | "interest_income"
        | "dividend_income"
        | "internal_transfer"
        | "tax_payment"
        | "withholding"
        | "receivable_receipt"
        | "payable_settlement"
        | "other"
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
        | "view_tax_returns"
        | "prepare_entity_return"
        | "review_entity_return"
        | "prepare_individual_return"
        | "review_individual_return"
        | "request_tax_information"
        | "deliver_tax_return"
        | "manage_tax_workpapers"
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
      investment_profile_type:
        | "individual"
        | "joint"
        | "llc"
        | "corporation"
        | "partnership"
        | "trust"
        | "ira"
        | "family_office"
        | "foundation"
        | "other_entity"
      investor_type: "individual" | "joint" | "entity" | "trust" | "ira"
      invitation_role: "investor" | "fund_manager"
      journal_source:
        | "manual"
        | "bank_reconciliation"
        | "payment"
        | "capital_call"
        | "distribution"
        | "fee_accrual"
        | "expense"
        | "valuation"
        | "allocation"
        | "adjustment"
        | "reversal"
        | "migration"
      journal_status: "draft" | "reviewed" | "approved" | "posted" | "reversed"
      ledger_account_type:
        | "asset"
        | "liability"
        | "equity"
        | "income"
        | "expense"
      ledger_basis: "accrual" | "cash" | "tax"
      match_confidence: "high" | "medium" | "low" | "unmatched"
      nav_status:
        | "draft"
        | "review"
        | "approved"
        | "published"
        | "superseded"
        | "calculating"
      onboarding_state:
        | "account_created"
        | "profile_required"
        | "identity_required"
        | "kyc_pending"
        | "aml_pending"
        | "verified"
        | "review_required"
        | "failed"
        | "reverification_required"
      payment_status:
        | "not_started"
        | "awaiting_wire"
        | "processing"
        | "settled"
        | "failed"
        | "returned"
        | "cancelled"
      portfolio_asset_class:
        | "private_common"
        | "private_preferred"
        | "safe"
        | "convertible_note"
        | "debt"
        | "fund_interest"
        | "spv_interest"
        | "real_estate"
        | "digital_security"
        | "cash_equivalent"
        | "other"
      portfolio_asset_status:
        | "active"
        | "partially_realized"
        | "realized"
        | "written_off"
      portfolio_valuation_status:
        | "draft"
        | "review"
        | "returned"
        | "rejected"
        | "approved"
        | "effective"
        | "superseded"
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
      profile_relationship_role:
        | "owner"
        | "beneficial_owner"
        | "control_person"
        | "manager"
        | "member"
        | "officer"
        | "director"
        | "trustee"
        | "grantor"
        | "authorized_signer"
        | "joint_owner"
        | "beneficiary"
      reconciliation_approver: "none" | "fund_manager" | "client"
      reg_type: "506b" | "506c" | "regcf" | "rega" | "regaplus"
      report_domain: "fund_accounting" | "cap_table"
      report_status:
        | "draft"
        | "prepared"
        | "review"
        | "approved"
        | "published"
        | "superseded"
      tax_documentation_form:
        | "w9"
        | "w8ben"
        | "w8bene"
        | "w8imy"
        | "w8eci"
        | "w8exp"
        | "none_on_file"
        | "other"
      tax_workflow_status:
        | "not_started"
        | "in_progress"
        | "harmonious_review"
        | "client_review"
        | "approved"
        | "complete"
        | "not_applicable"
      valuation_evidence_kind:
        | "cap_table"
        | "financing_document"
        | "purchase_agreement"
        | "board_materials"
        | "third_party_appraisal"
        | "brokerage_statement"
        | "market_price_evidence"
        | "waterfall_capitalization"
        | "portfolio_company_financials"
        | "other"
      valuation_method:
        | "recent_financing"
        | "transaction_price"
        | "secondary_transaction"
        | "market_comparable"
        | "public_market"
        | "dcf"
        | "income_approach"
        | "cost"
        | "adjusted_cost"
        | "appraisal"
        | "manager_mark"
        | "third_party"
        | "other"
      valuation_source_type:
        | "independent_third_party"
        | "observable_transaction"
        | "recent_financing"
        | "public_market"
        | "manager_mark"
        | "internal_model"
        | "other"
      valuation_status:
        | "draft"
        | "review"
        | "approved"
        | "superseded"
        | "rejected"
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
      accounting_exception_kind: [
        "unmatched_cash",
        "duplicate_candidate",
        "suspected_duplicate",
        "amount_mismatch",
        "account_mismatch",
        "unknown_counterparty",
        "missing_investor",
        "missing_fund",
        "missing_accounting_mapping",
        "closed_period_transaction",
        "inconsistent_currency",
        "reconciliation_conflict",
        "posting_failure",
        "stale_valuation",
        "missing_valuation_source",
        "missing_valuation_methodology",
        "unsupported_valuation_change",
        "valuation_change_threshold",
        "missing_quantity",
        "missing_cost_basis",
        "impossible_valuation",
        "conflicting_valuation_sources",
        "missing_valuation_evidence",
      ],
      accounting_exception_status: [
        "open",
        "investigating",
        "resolved",
        "waived",
      ],
      accounting_period_status: [
        "open",
        "soft_closed",
        "review",
        "closed",
        "locked",
      ],
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
      assisted_draft_status: [
        "awaiting_client_review",
        "approved",
        "rejected",
        "changes_requested",
        "withdrawn",
      ],
      assisted_draft_type: [
        "profile_contact",
        "entity_information",
        "ownership_information",
        "investment_questionnaire",
        "kyc_support",
        "kyb_support",
        "accreditation",
        "investment",
      ],
      cash_transaction_type: [
        "investor_contribution",
        "capital_call",
        "subscription_receipt",
        "distribution",
        "management_fee",
        "fund_expense",
        "organizational_expense",
        "portfolio_investment",
        "investment_proceeds",
        "interest_income",
        "dividend_income",
        "internal_transfer",
        "tax_payment",
        "withholding",
        "receivable_receipt",
        "payable_settlement",
        "other",
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
        "view_tax_returns",
        "prepare_entity_return",
        "review_entity_return",
        "prepare_individual_return",
        "review_individual_return",
        "request_tax_information",
        "deliver_tax_return",
        "manage_tax_workpapers",
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
      investment_profile_type: [
        "individual",
        "joint",
        "llc",
        "corporation",
        "partnership",
        "trust",
        "ira",
        "family_office",
        "foundation",
        "other_entity",
      ],
      investor_type: ["individual", "joint", "entity", "trust", "ira"],
      invitation_role: ["investor", "fund_manager"],
      journal_source: [
        "manual",
        "bank_reconciliation",
        "payment",
        "capital_call",
        "distribution",
        "fee_accrual",
        "expense",
        "valuation",
        "allocation",
        "adjustment",
        "reversal",
        "migration",
      ],
      journal_status: ["draft", "reviewed", "approved", "posted", "reversed"],
      ledger_account_type: [
        "asset",
        "liability",
        "equity",
        "income",
        "expense",
      ],
      ledger_basis: ["accrual", "cash", "tax"],
      match_confidence: ["high", "medium", "low", "unmatched"],
      nav_status: [
        "draft",
        "review",
        "approved",
        "published",
        "superseded",
        "calculating",
      ],
      onboarding_state: [
        "account_created",
        "profile_required",
        "identity_required",
        "kyc_pending",
        "aml_pending",
        "verified",
        "review_required",
        "failed",
        "reverification_required",
      ],
      payment_status: [
        "not_started",
        "awaiting_wire",
        "processing",
        "settled",
        "failed",
        "returned",
        "cancelled",
      ],
      portfolio_asset_class: [
        "private_common",
        "private_preferred",
        "safe",
        "convertible_note",
        "debt",
        "fund_interest",
        "spv_interest",
        "real_estate",
        "digital_security",
        "cash_equivalent",
        "other",
      ],
      portfolio_asset_status: [
        "active",
        "partially_realized",
        "realized",
        "written_off",
      ],
      portfolio_valuation_status: [
        "draft",
        "review",
        "returned",
        "rejected",
        "approved",
        "effective",
        "superseded",
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
      profile_relationship_role: [
        "owner",
        "beneficial_owner",
        "control_person",
        "manager",
        "member",
        "officer",
        "director",
        "trustee",
        "grantor",
        "authorized_signer",
        "joint_owner",
        "beneficiary",
      ],
      reconciliation_approver: ["none", "fund_manager", "client"],
      reg_type: ["506b", "506c", "regcf", "rega", "regaplus"],
      report_domain: ["fund_accounting", "cap_table"],
      report_status: [
        "draft",
        "prepared",
        "review",
        "approved",
        "published",
        "superseded",
      ],
      tax_documentation_form: [
        "w9",
        "w8ben",
        "w8bene",
        "w8imy",
        "w8eci",
        "w8exp",
        "none_on_file",
        "other",
      ],
      tax_workflow_status: [
        "not_started",
        "in_progress",
        "harmonious_review",
        "client_review",
        "approved",
        "complete",
        "not_applicable",
      ],
      valuation_evidence_kind: [
        "cap_table",
        "financing_document",
        "purchase_agreement",
        "board_materials",
        "third_party_appraisal",
        "brokerage_statement",
        "market_price_evidence",
        "waterfall_capitalization",
        "portfolio_company_financials",
        "other",
      ],
      valuation_method: [
        "recent_financing",
        "transaction_price",
        "secondary_transaction",
        "market_comparable",
        "public_market",
        "dcf",
        "income_approach",
        "cost",
        "adjusted_cost",
        "appraisal",
        "manager_mark",
        "third_party",
        "other",
      ],
      valuation_source_type: [
        "independent_third_party",
        "observable_transaction",
        "recent_financing",
        "public_market",
        "manager_mark",
        "internal_model",
        "other",
      ],
      valuation_status: [
        "draft",
        "review",
        "approved",
        "superseded",
        "rejected",
      ],
    },
  },
} as const
