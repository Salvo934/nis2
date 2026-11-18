"use client";

import { Building2, Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveOrganizationAction } from "@/features/organizations/actions";
import type { Membership } from "@/features/organizations/active-organization";
import { ROLES, labelOf } from "@/features/organizations/constants";

type Props = { memberships: Membership[]; activeId: string | null };

export function OrganizationSwitcher({ memberships, activeId }: Props) {
  const [pending, startTransition] = useTransition();
  const active = memberships.find((m) => m.organization.id === activeId);

  function select(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await setActiveOrganizationAction(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  if (memberships.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/organizations/new">
          <Plus /> Crea organizzazione
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-64 justify-between gap-2 px-2.5"
          aria-label={`Organizzazione attiva: ${active?.organization.name ?? "nessuna"}. Cambia organizzazione`}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Building2 className="text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate font-medium">{active?.organization.name ?? "Seleziona"}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Organizzazioni</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.organization.id}
            onSelect={() => select(m.organization.id)}
            className="gap-2"
          >
            <Check
              className={m.organization.id === activeId ? "opacity-100" : "opacity-0"}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{m.organization.name}</span>
              <span className="text-xs text-muted-foreground">{labelOf(ROLES, m.role)}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organizations/new">
            <Plus /> Nuova organizzazione
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
