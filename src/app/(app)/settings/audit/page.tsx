import type { Metadata } from "next";

import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { AuditLogTable } from "@/features/organizations/components/audit-log-table";
import { getPermissionContext, listAuditLogs } from "@/features/organizations/data";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage() {
  const { context, allowed } = await getPermissionContext("audit.read");
  const header = (
    <PageHeader
      title="Audit log"
      description="Registro non modificabile delle operazioni rilevanti. Sono mostrati gli ultimi 100 eventi."
    />
  );
  if (!allowed) {
    return (
      <>
        {header}
        <AccessDenied message="L'audit log è consultabile solo da amministratori e auditor." />
      </>
    );
  }
  const rows = await listAuditLogs(context.active.organization.id);
  return (
    <>
      {header}
      <AuditLogTable rows={rows} />
    </>
  );
}
