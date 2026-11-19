import type { OrgRole } from "@/types/database";

/**
 * UI-side mirror of the RLS matrix in docs/DATABASE.md §3.
 * It only decides what to *show*; the database enforces the same rules
 * independently, so a wrong entry here can never grant access.
 */
export type Permission =
  | "organization.update"
  | "members.manage"
  | "invitations.manage"
  | "audit.read"
  | "assessment.manage"
  | "tasks.manage"
  | "assessment.delete";

const MATRIX: Record<Permission, readonly OrgRole[]> = {
  "organization.update": ["org_admin"],
  "members.manage": ["org_admin"],
  "invitations.manage": ["org_admin"],
  "audit.read": ["org_admin", "auditor"],
  "assessment.manage": ["org_admin", "security_manager"],
  "tasks.manage": ["org_admin", "security_manager"],
  "assessment.delete": ["org_admin"],
};

export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  return role != null && MATRIX[permission].includes(role);
}
