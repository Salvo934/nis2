import { Badge } from "@/components/ui/badge";
import { ROLES, labelOf } from "@/features/organizations/constants";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/types/database";

const styles: Record<OrgRole, string> = {
  org_admin: "border-primary/30 bg-primary/10 text-primary",
  security_manager: "border-info/30 bg-info/10 text-info",
  auditor: "border-warning/40 bg-warning/10 text-foreground",
  viewer: "border-border bg-muted text-muted-foreground",
};

export function RoleBadge({ role, className }: { role: OrgRole; className?: string }) {
  return (
    <Badge variant="outline" className={cn(styles[role], className)}>
      {labelOf(ROLES, role)}
    </Badge>
  );
}
