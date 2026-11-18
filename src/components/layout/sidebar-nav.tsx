"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_SECTIONS } from "@/components/layout/nav-items";
import { can } from "@/features/organizations/permissions";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/types/database";

type Props = { role: OrgRole | null; onNavigate?: () => void };

export function SidebarNav({ role, onNavigate }: Props) {
  const pathname = usePathname();
  const base =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring/60";

  return (
    <nav aria-label="Navigazione principale" className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section, index) => {
        // Organisation settings only make sense once the user belongs to one.
        if (section.label && !role) return null;
        const items = section.items.filter((item) => !item.permission || can(role, item.permission));
        return (
          <div key={section.label ?? index} className="flex flex-col gap-1">
            {section.label ? (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                {section.label}
              </p>
            ) : null}
            {items.map(({ href, label, icon: Icon, available }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              if (!available) {
                return (
                  <span
                    key={href}
                    aria-disabled="true"
                    className={cn(base, "cursor-not-allowed text-sidebar-foreground/45")}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sidebar-foreground/60 uppercase">
                      Presto
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    base,
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className={cn("size-4", active && "text-sidebar-primary")} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
