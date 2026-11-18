import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** How the number is computed — always shown, never hidden in a tooltip only. */
  criterion: string;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneText = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

export function MetricCard({ label, value, icon: Icon, criterion, tone = "default" }: Props) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
        <p className={cn("text-2xl font-semibold tabular-nums", toneText[tone])}>{value}</p>
        <p className="text-xs leading-snug text-muted-foreground">{criterion}</p>
      </CardContent>
    </Card>
  );
}
