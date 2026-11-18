import type { OrgRole } from "@/types/database";

export const ACTIVE_ORG_COOKIE = "nis2_active_org";

export type Membership = {
  role: OrgRole;
  organization: { id: string; name: string };
};

/**
 * The cookie is only a *preference*: it is honoured only if the user is a
 * member of that organisation, otherwise the first membership (alphabetical)
 * is used. RLS would hide another tenant's data anyway.
 */
export function pickActiveMembership(
  memberships: Membership[],
  preferredOrgId: string | undefined,
): Membership | null {
  if (memberships.length === 0) return null;
  const preferred = preferredOrgId
    ? memberships.find((m) => m.organization.id === preferredOrgId)
    : undefined;
  if (preferred) return preferred;
  return [...memberships].sort((a, b) => a.organization.name.localeCompare(b.organization.name, "it"))[0]!;
}
