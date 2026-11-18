"use client";

import { Loader2, LogOut, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  leaveOrganizationAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/features/organizations/actions";
import { RoleBadge } from "@/features/organizations/components/role-badge";
import { ROLES } from "@/features/organizations/constants";
import { formatDate } from "@/lib/format";
import type { OrgRole } from "@/types/database";

export type MemberRow = {
  id: string;
  role: OrgRole;
  created_at: string;
  user_id: string;
  profile: { email: string; full_name: string | null };
};

type Props = { members: MemberRow[]; currentUserId: string; canManage: boolean; organizationName: string };

type Confirm = { kind: "remove"; member: MemberRow } | { kind: "leave" } | null;

export function MembersTable({ members, currentUserId, canManage, organizationName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  function changeRole(member: MemberRow, role: string) {
    setBusyId(member.id);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ memberId: member.id, role });
      setBusyId(null);
      if (result.ok) toast.success("Ruolo aggiornato");
      else toast.error(result.error);
    });
  }

  function runConfirmed() {
    const current = confirm;
    if (!current) return;
    startTransition(async () => {
      const result =
        current.kind === "remove"
          ? await removeMemberAction(current.member.id)
          : await leaveOrganizationAction();
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (current.kind === "leave") {
        toast.success(`Hai lasciato ${organizationName}`);
        router.push("/dashboard");
      } else {
        toast.success("Membro rimosso");
      }
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead className="w-56">Ruolo</TableHead>
              <TableHead className="hidden md:table-cell">Membro dal</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Azioni</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.user_id === currentUserId;
              const name = member.profile.full_name ?? member.profile.email;
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {name}
                        {isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(tu)</span> : null}
                      </span>
                      {member.profile.full_name ? (
                        <span className="text-xs text-muted-foreground">{member.profile.email}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(value) => changeRole(member, value)}
                          disabled={pending}
                        >
                          <SelectTrigger size="sm" className="w-44" aria-label={`Ruolo di ${name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {busyId === member.id ? (
                          <Loader2 className="size-4 animate-spin" aria-label="Salvataggio" />
                        ) : null}
                      </div>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDate(member.created_at)}
                  </TableCell>
                  <TableCell>
                    {isSelf ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Lascia l'organizzazione"
                        onClick={() => setConfirm({ kind: "leave" })}
                        disabled={pending}
                      >
                        <LogOut />
                      </Button>
                    ) : canManage ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Rimuovi ${name}`}
                        onClick={() => setConfirm({ kind: "remove", member })}
                        disabled={pending}
                      >
                        <UserMinus />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "leave" ? "Lasciare l'organizzazione?" : "Rimuovere il membro?"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "leave"
                ? `Perderai l'accesso ai dati di ${organizationName}. Potrai rientrare solo con un nuovo invito.`
                : confirm?.kind === "remove"
                  ? `${confirm.member.profile.full_name ?? confirm.member.profile.email} perderà l'accesso a ${organizationName}.`
                  : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Annulla
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={runConfirmed} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {confirm?.kind === "leave" ? "Lascia" : "Rimuovi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
