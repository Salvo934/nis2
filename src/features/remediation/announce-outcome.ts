"use client";

import { toast } from "sonner";

import type { TaskOutcome } from "@/features/remediation/actions";

/** Tells the user what happened to the linked requirement after a task change. */
export function announceOutcome(message: string, outcome: TaskOutcome) {
  if (outcome.resolved) {
    toast.success(message, {
      description: `Requisito ${outcome.resolved.code} segnato come «Implementato»: la lacuna è chiusa in gap analysis e nell'assessment.`,
      duration: 7000,
    });
  } else if (outcome.reopened) {
    toast.warning(message, {
      description: `Requisito ${outcome.reopened.code} riaperto: torna alla valutazione precedente.`,
      duration: 7000,
    });
  } else {
    toast.success(message);
  }
}
