import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { Membership } from "@/features/organizations/active-organization";
import { OrganizationSwitcher } from "@/features/organizations/components/organization-switcher";
import { RoleBadge } from "@/features/organizations/components/role-badge";
import type { SessionUser } from "@/lib/auth/session";

type Props = { user: SessionUser; memberships: Membership[]; active: Membership | null };

export function AppHeader({ user, memberships, active }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
      <MobileNav role={active?.role ?? null} />
      <OrganizationSwitcher memberships={memberships} activeId={active?.organization.id ?? null} />
      {active ? <RoleBadge role={active.role} className="hidden sm:inline-flex" /> : null}
      <div className="flex-1" />
      <ThemeToggle />
      <UserMenu email={user.email} fullName={user.fullName} />
    </header>
  );
}
