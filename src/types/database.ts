/**
 * Database types in the shape produced by `supabase gen types typescript`.
 *
 * Hand-written for Milestone 2 because type generation needs the Supabase
 * local stack (Docker). Keep in sync with supabase/migrations and replace with
 * the generated file as soon as possible: `npm run db:types`.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgRole = "org_admin" | "security_manager" | "auditor" | "viewer";
export type SizeClass = "micro" | "small" | "medium" | "large" | "not_specified";
export type Nis2Classification = "not_determined" | "essential" | "important" | "not_in_scope";
export type AssessmentStatus = "draft" | "in_progress" | "completed" | "archived";
export type AnswerStatus = "not_assessed" | "implemented" | "partial" | "not_implemented" | "not_applicable";
export type GapSeverity = "low" | "medium" | "high" | "critical";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; full_name: string | null; created_at: string; updated_at: string };
        Insert: never;
        Update: { full_name?: string | null };
        Relationships: [];
      };
      platform_admins: {
        Row: { user_id: string; granted_by: string | null; granted_at: string; note: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          vat_number: string | null;
          sector: string;
          size_class: SizeClass;
          nis2_classification: Nis2Classification;
          classification_basis: string | null;
          classification_updated_at: string | null;
          classification_updated_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          /** Fictitious organisation of an anonymous demo visitor. */
          is_demo: boolean;
        };
        Insert: never;
        Update: {
          name?: string;
          vat_number?: string | null;
          sector?: string;
          size_class?: SizeClass;
          nis2_classification?: Nis2Classification;
          classification_basis?: string | null;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { role?: OrgRole };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: OrgRole;
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "organization_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      regulatory_frameworks: {
        Row: { id: string; code: string; name: string; issuing_authority: string | null; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      regulatory_framework_versions: {
        Row: {
          id: string;
          framework_id: string;
          version_label: string;
          source_title: string;
          source_url: string | null;
          source_published_at: string | null;
          scope_note: string | null;
          dataset_checksum: string;
          status: "draft" | "published" | "retired";
          imported_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      requirements: {
        Row: {
          id: string;
          framework_version_id: string;
          code: string;
          category_code: string;
          category_name: string;
          title: string;
          description: string;
          source_reference: string;
          sort_order: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      assessments: {
        Row: {
          id: string;
          organization_id: string;
          framework_version_id: string;
          title: string;
          status: AssessmentStatus;
          created_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { title?: string; status?: AssessmentStatus };
        Relationships: [];
      };
      assessment_answers: {
        Row: {
          id: string;
          organization_id: string;
          assessment_id: string;
          framework_version_id: string;
          requirement_id: string;
          status: AnswerStatus;
          justification: string | null;
          owner_id: string | null;
          gap_severity: GapSeverity | null;
          assessed_at: string | null;
          assessed_by: string | null;
          updated_at: string;
          /** Set by the database when completed tasks closed the gap. */
          resolved_by_tasks: boolean;
          pre_resolution: Json | null;
        };
        Insert: never;
        Update: {
          status?: AnswerStatus;
          justification?: string | null;
          owner_id?: string | null;
          gap_severity?: GapSeverity | null;
        };
        Relationships: [];
      };
      remediation_tasks: {
        Row: {
          id: string;
          organization_id: string;
          assessment_answer_id: string | null;
          title: string;
          description: string | null;
          priority: TaskPriority;
          status: TaskStatus;
          assignee_id: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          assessment_answer_id?: string | null;
          title: string;
          description?: string | null;
          priority?: TaskPriority;
          status?: TaskStatus;
          assignee_id?: string | null;
          due_date?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          priority?: TaskPriority;
          status?: TaskStatus;
          assignee_id?: string | null;
          due_date?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: { p_name: string; p_vat_number?: string | null; p_sector?: string; p_size_class?: string };
        Returns: string;
      };
      create_invitation: {
        Args: { p_org: string; p_email: string; p_role: string };
        Returns: { invitation_id: string; token: string; expires_at: string }[];
      };
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          status: "pending" | "accepted" | "revoked" | "expired" | "invalid";
          organization_name: string | null;
          role: OrgRole | null;
          invited_email: string | null;
          email_matches: boolean | null;
        }[];
      };
      accept_invitation: { Args: { p_token: string }; Returns: string };
      create_assessment: {
        Args: { p_org: string; p_framework_version: string; p_title: string };
        Returns: string;
      };
      create_demo_organization: { Args: Record<string, never>; Returns: string };
      log_report_generated: { Args: { p_assessment: string; p_format?: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
