"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { ACTIVE_ORG_COOKIE } from "@/features/organizations/active-organization";
import { getOrgContext, requireActiveOrganization } from "@/features/organizations/data";
import { GENERIC_ERROR, dbErrorCode, mapDbError } from "@/features/organizations/errors";
import { can } from "@/features/organizations/permissions";
import {
  invitationTokenSchema,
  inviteMemberSchema,
  organizationProfileSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  uuidSchema,
} from "@/features/organizations/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const FORBIDDEN = "Non hai i permessi per questa operazione.";
const INVALID = "Controlla i campi evidenziati.";

async function setActiveOrgCookie(organizationId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function logUnexpected(scope: string, error: { code?: string; message?: string } | null) {
  if (error && !dbErrorCode(error)) console.error(`[organizations] ${scope}`, error.code);
}

// -----------------------------------------------------------------------------

export async function createOrganizationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const parsed = organizationProfileSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const { name, vatNumber, sector, sizeClass } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_vat_number: vatNumber,
    p_sector: sector,
    p_size_class: sizeClass,
  });
  if (error || !data) {
    logUnexpected("create", error);
    return fail(mapDbError(error));
  }

  await setActiveOrgCookie(data);
  refresh();
  return ok({ id: data });
}

export async function setActiveOrganizationAction(organizationId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(organizationId);
  if (!parsed.success) return fail(FORBIDDEN);

  // Membership is checked server-side; the id from the browser is only a request.
  const { memberships } = await getOrgContext();
  if (!memberships.some((m) => m.organization.id === parsed.data)) return fail(FORBIDDEN);

  await setActiveOrgCookie(parsed.data);
  refresh();
  return ok();
}

export async function updateOrganizationAction(input: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "organization.update")) return fail(FORBIDDEN);

  const parsed = updateOrganizationSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name: v.name,
      vat_number: v.vatNumber,
      sector: v.sector,
      size_class: v.sizeClass,
      nis2_classification: v.nis2Classification,
      classification_basis:
        v.nis2Classification === "not_determined" ? v.classificationBasis || null : v.classificationBasis,
    })
    .eq("id", active.organization.id)
    .select("id");

  if (error) {
    logUnexpected("update", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);

  refresh();
  return ok();
}

export async function inviteMemberAction(
  input: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string; email: string }>> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "invitations.manage")) return fail(FORBIDDEN);

  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_invitation", {
      p_org: active.organization.id,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    })
    .single();
  if (error || !data) {
    logUnexpected("invite", error);
    return fail(mapDbError(error));
  }

  refresh();
  // The plaintext token is returned once, to the admin who created it.
  return ok({ token: data.token, expiresAt: data.expires_at, email: parsed.data.email });
}

export async function revokeInvitationAction(invitationId: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "invitations.manage")) return fail(FORBIDDEN);
  const parsed = uuidSchema.safeParse(invitationId);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: parsed.data });
  if (error) {
    logUnexpected("revoke", error);
    return fail(mapDbError(error));
  }
  refresh();
  return ok();
}

export async function updateMemberRoleAction(input: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "members.manage")) return fail(FORBIDDEN);
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.memberId)
    .eq("organization_id", active.organization.id) // defence in depth on top of RLS
    .select("id");
  if (error) {
    logUnexpected("role", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}

export async function removeMemberAction(memberId: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "members.manage")) return fail(FORBIDDEN);
  const parsed = uuidSchema.safeParse(memberId);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", active.organization.id)
    .select("id");
  if (error) {
    logUnexpected("remove", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}

export async function leaveOrganizationAction(): Promise<ActionResult> {
  const { user, active } = await requireActiveOrganization();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", active.organization.id)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    logUnexpected("leave", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(GENERIC_ERROR);
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  refresh();
  return ok();
}

export async function acceptInvitationAction(
  token: unknown,
): Promise<ActionResult<{ organizationId: string }>> {
  await requireUser();
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success) return fail(mapDbError({ message: "invitation_invalid" }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data });
  if (error || !data) {
    logUnexpected("accept", error);
    return fail(mapDbError(error));
  }
  await setActiveOrgCookie(data);
  refresh();
  return ok({ organizationId: data });
}
