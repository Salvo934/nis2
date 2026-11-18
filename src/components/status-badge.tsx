import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/features/assessment/constants";
import { cn } from "@/lib/utils";

const toneClasses: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/15 text-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-border bg-secondary text-secondary-foreground",
  muted: "border-border bg-muted text-muted-foreground",
};

type Option<T extends string> = { value: T; label: string; tone: Tone };

export function StatusBadge<T extends string>({
  options,
  value,
  className,
}: {
  options: readonly Option<T>[];
  value: T;
  className?: string;
}) {
  const option = options.find((o) => o.value === value);
  return (
    <Badge variant="outline" className={cn(toneClasses[option?.tone ?? "muted"], className)}>
      {option?.label ?? value}
    </Badge>
  );
}
