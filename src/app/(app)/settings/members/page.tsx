import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { InviteMemberDialog } from "@/features/organizations/components/invite-member-dialog";
import { MembersTable } from "@/features/organizations/components/members-table";
import { PendingInvitations } from "@/features/organizations/components/pending-invitations";
import { ROLES } from "@/features/organizations/constants";
import {
  listMembers,
  listPendingInvitations,
  requireActiveOrganization,
} from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";

export const metadata: Metadata = { title: "Membri e inviti" };

export default async function MembersPage() {
  const { user, active } = await requireActiveOrganization();
  const canManage = can(active.role, "members.manage");
  const [members, invitations] = await Promise.all([
    listMembers(active.organization.id),
    canManage ? listPendingInvitations(active.organization.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Membri e inviti"
        description={`${members.length} ${members.length === 1 ? "membro" : "membri"} in ${active.organization.name}.`}
        actions={canManage ? <InviteMemberDialog /> : null}
      />

      <MembersTable
        members={members}
        currentUserId={user.id}
        canManage={canManage}
        organizationName={active.organization.name}
      />

      {canManage ? (
        <section aria-labelledby="pending-invitations" className="space-y-3">
          <h2 id="pending-invitations" className="text-lg font-semibold">
            Inviti in sospeso
          </h2>
          {/* eslint-disable-next-line react-hooks/purity -- server component: render-time clock is intended */}
          <PendingInvitations invitations={invitations} now={Date.now()} />
        </section>
      ) : null}

      <section aria-labelledby="roles" className="space-y-3">
        <h2 id="roles" className="text-lg font-semibold">
          Ruoli
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <div key={role.value} className="rounded-xl border p-4">
              <dt className="font-medium">{role.label}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{role.description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
