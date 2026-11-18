"use client";

import { Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { revokeInvitationAction } from "@/features/organizations/actions";
import { RoleBadge } from "@/features/organizations/components/role-badge";
import { formatDateTime } from "@/lib/format";
import type { OrgRole } from "@/types/database";

type Invitation = { id: string; email: string; role: OrgRole; expires_at: string; created_at: string };

export function PendingInvitations({ invitations, now }: { invitations: Invitation[]; now: number }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function revoke(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await revokeInvitationAction(id);
      setBusyId(null);
      if (result.ok) toast.success("Invito revocato");
      else toast.error(result.error);
    });
  }

  if (invitations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nessun invito in sospeso.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Ruolo</TableHead>
            <TableHead>Scadenza</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Azioni</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => {
            const expired = new Date(inv.expires_at).getTime() <= now;
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.email}</TableCell>
                <TableCell>
                  <RoleBadge role={inv.role} />
                </TableCell>
                <TableCell className={expired ? "text-destructive" : "text-muted-foreground"}>
                  {expired ? "Scaduto" : formatDateTime(inv.expires_at)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Revoca l'invito per ${inv.email}`}
                    onClick={() => revoke(inv.id)}
                    disabled={pending}
                  >
                    {busyId === inv.id ? <Loader2 className="animate-spin" /> : <X />}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
