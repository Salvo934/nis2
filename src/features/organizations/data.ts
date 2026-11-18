import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  ACTIVE_ORG_COOKIE,
  pickActiveMembership,
  type Membership,
} from "@/features/organizations/active-organization";
import { can, type Permission } from "@/features/organizations/permissions";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for tenancy. Every query runs with the user's JWT, so RLS
 * applies; the role checks here only decide what to render and give clearer
 * errors. Organisation ids are always resolved server-side from the user's
 * memberships, never taken from the browser as proof of access.
 */

export type OrgContext = {
  user: SessionUser;
  memberships: Membership[];
  active: Membership | null;
};

export type ActiveOrgContext = OrgContext & { active: Membership };

export const getOrgContext = cache(async (): Promise<OrgContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations!inner(id, name)")
    .eq("user_id", user.id);

  if (error) {
    console.error("[tenancy] failed to load memberships", error.code);
    throw new Error("Impossibile caricare le organizzazioni");
  }

  const memberships: Membership[] = (data ?? []).map((row) => ({
    role: row.role,
    organization: { id: row.organization.id, name: row.organization.name },
  }));
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;

  return { user, memberships, active: pickActiveMembership(memberships, preferred) };
});

/** Redirects to onboarding when the user has no organisation yet. */
export async function requireActiveOrganization(): Promise<ActiveOrgContext> {
  const context = await getOrgContext();
  if (!context.active) redirect("/organizations/new");
  return context as ActiveOrgContext;
}

export async function getPermissionContext(permission: Permission) {
  const context = await requireActiveOrganization();
  return { context, allowed: can(context.active.role, permission) };
}

export async function getOrganization(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Impossibile caricare l'organizzazione");
  return data;
}

export async function listMembers(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role, created_at, user_id, profile:profiles!inner(email, full_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Impossibile caricare i membri");
  return data;
}

export async function listPendingInvitations(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Impossibile caricare gli inviti");
  return data;
}

export async function listAuditLogs(organizationId: string, limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, actor_id, metadata, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Impossibile caricare l'audit log");

  // Resolve actor names among profiles visible to the caller (co-members).
  const actorIds = [...new Set(data.map((row) => row.actor_id).filter((id): id is string => id !== null))];
  const actors = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", actorIds);
    for (const p of profiles ?? []) actors.set(p.id, p.full_name ?? p.email);
  }
  return data.map((row) => ({
    ...row,
    actorName: row.actor_id ? (actors.get(row.actor_id) ?? "Utente non più membro") : "Sistema",
  }));
}
