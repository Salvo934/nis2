"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startDemoAction } from "@/features/demo/actions";
import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  size?: "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  className?: string;
};

/** One click: anonymous session + a private copy of the fictitious company. */
export function DemoButton({
  label = "Prova la demo",
  size = "default",
  variant = "default",
  className,
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn(className)}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // On success the action redirects to the dashboard.
          const result = await startDemoAction();
          if (result && !result.ok) toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlayCircle aria-hidden="true" />}
      {pending ? "Preparazione della demo…" : label}
    </Button>
  );
}
