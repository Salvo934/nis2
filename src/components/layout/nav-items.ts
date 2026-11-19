import {
  Building2,
  ClipboardList,
  FileBarChart,
  FolderLock,
  LayoutDashboard,
  ListTodo,
  ScrollText,
  SearchCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/features/organizations/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Modules not built yet are shown disabled, never as working features. */
  available: boolean;
  /** Hide the entry when the active role lacks this permission (UI only; pages re-check). */
  permission?: Permission;
};

export type NavSection = { label: string | null; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, available: true },
      { href: "/assessments", label: "Assessment NIS2", icon: ClipboardList, available: true },
      { href: "/gap-analysis", label: "Gap analysis", icon: SearchCheck, available: true },
      { href: "/tasks", label: "Piano di adeguamento", icon: ListTodo, available: true },
      { href: "/evidence", label: "Evidenze", icon: FolderLock, available: false },
      { href: "/reports", label: "Report", icon: FileBarChart, available: true },
    ],
  },
  {
    label: "Organizzazione",
    items: [
      { href: "/settings/organization", label: "Dati aziendali", icon: Building2, available: true },
      { href: "/settings/members", label: "Membri e inviti", icon: Users, available: true },
      {
        href: "/settings/audit",
        label: "Audit log",
        icon: ScrollText,
        available: true,
        permission: "audit.read",
      },
    ],
  },
];
