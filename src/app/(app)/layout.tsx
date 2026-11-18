import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getOrgContext } from "@/features/organizations/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // getOrgContext() calls requireUser(): authoritative session check (proxy.ts
  // only redirects optimistically). Pages and actions re-check on their own,
  // because layouts are not re-rendered on every navigation.
  const { user, memberships, active } = await getOrgContext();

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Vai al contenuto
      </a>
      <AppSidebar role={active?.role ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} memberships={memberships} active={active} />
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
