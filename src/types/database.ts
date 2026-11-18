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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
