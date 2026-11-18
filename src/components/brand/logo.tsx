import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Use on dark (navy) surfaces such as the sidebar. */
  inverted?: boolean;
};

export function Logo({ className, inverted = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-lg",
          inverted
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "bg-primary text-primary-foreground",
        )}
        aria-hidden="true"
      >
        <ShieldCheck className="size-4.5" />
      </span>
      <span>
        NIS2 <span className={inverted ? "text-sidebar-primary" : "text-primary"}>Control</span>
      </span>
    </span>
  );
}
