import type { OrgRole } from "@/types/database";

/**
 * UI-side mirror of the RLS matrix in docs/DATABASE.md §3.
 * It only decides what to *show*; the database enforces the same rules
 * independently, so a wrong entry here can never grant access.
 */
export type Permission = "organization.update" | "members.manage" | "invitations.manage" | "audit.read";

const MATRIX: Record<Permission, readonly OrgRole[]> = {
  "organization.update": ["org_admin"],
  "members.manage": ["org_admin"],
  "invitations.manage": ["org_admin"],
  "audit.read": ["org_admin", "auditor"],
};

export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  return role != null && MATRIX[permission].includes(role);
}
