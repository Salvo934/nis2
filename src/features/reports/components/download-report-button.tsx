"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { prepareReportAction } from "@/features/reports/actions";

function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

type Props = { assessmentId: string; variant?: "default" | "outline"; label?: string };

export function DownloadReportButton({
  assessmentId,
  variant = "default",
  label = "Scarica report PDF",
}: Props) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const result = await prepareReportAction(assessmentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Loaded on demand: the PDF library is only downloaded when needed.
      const [{ buildReportModel }, { renderReportPdf }] = await Promise.all([
        import("@/features/reports/model"),
        import("@/features/reports/pdf"),
      ]);
      const input = result.data;
      const doc = renderReportPdf(buildReportModel(input));
      doc.save(
        `report-nis2-${slug(input.organization.name)}-${slug(input.assessment.title)}-${input.today}.pdf`,
      );
      toast.success("Report generato", { description: "Il download è stato registrato nell'audit log." });
    } catch (error) {
      console.error(error);
      toast.error("Non è stato possibile generare il report. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} onClick={download} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}
      {busy ? "Generazione in corso…" : label}
    </Button>
  );
}
