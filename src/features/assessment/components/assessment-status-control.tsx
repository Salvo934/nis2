"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateAssessmentStatusAction } from "@/features/assessment/actions";
import { ASSESSMENT_STATUSES } from "@/features/assessment/constants";
import type { AssessmentStatus } from "@/types/database";

export function AssessmentStatusControl({
  assessmentId,
  status,
}: {
  assessmentId: string;
  status: AssessmentStatus;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(value) =>
        startTransition(async () => {
          const result = await updateAssessmentStatusAction({ assessmentId, status: value });
          if (result.ok) toast.success("Stato aggiornato");
          else toast.error(result.error);
        })
      }
    >
      <SelectTrigger className="h-9 w-44" aria-label="Stato dell'assessment">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSESSMENT_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
