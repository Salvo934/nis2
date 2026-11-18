import { SearchCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { GapTable, type GapRow } from "@/features/assessment/components/gap-table";
import { GAP_SEVERITIES } from "@/features/assessment/constants";
import { getCurrentAssessment, listAssessmentItems, listMemberOptions } from "@/features/assessment/data";
import { isOpenTask } from "@/features/assessment/metrics";
import { requireActiveOrganization } from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";
import { listTasks } from "@/features/remediation/data";

export const metadata: Metadata = { title: "Gap analysis" };

const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function GapAnalysisPage() {
  const { active } = await requireActiveOrganization();
  const orgId = active.organization.id;
  const assessment = await getCurrentAssessment(orgId);

  if (!assessment) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Gap analysis" description="Le lacune emergono dai risultati dell'assessment." />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <SearchCheck className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">
            Nessun assessment attivo. Avvia un assessment per generare la gap analysis.
          </p>
          <Button asChild>
            <Link href="/assessments">Vai agli assessment</Link>
          </Button>
        </div>
      </div>
    );
  }

  const [items, tasks, members] = await Promise.all([
    listAssessmentItems(orgId, assessment),
    listTasks(orgId),
    listMemberOptions(orgId),
  ]);

  const gaps: GapRow[] = items
    .filter((i) => i.answer.status === "partial" || i.answer.status === "not_implemented")
    .map((i) => {
      const linked = tasks.filter((t) => t.assessment_answer_id === i.answer.id);
      return {
        answerId: i.answer.id,
        code: i.requirement.code,
        title: i.requirement.title,
        category: i.requirement.category_name,
        status: i.answer.status,
        severity: i.answer.gap_severity,
        justification: i.answer.justification,
        totalTasks: linked.length,
        openTasks: linked.filter((t) => isOpenTask(t.status)).length,
      };
    })
    .sort((a, b) => (severityRank[a.severity ?? ""] ?? 9) - (severityRank[b.severity ?? ""] ?? 9));

  const notAssessed = items.filter((i) => i.answer.status === "not_assessed").length;
  const withoutTasks = gaps.filter((g) => g.openTasks === 0).length;
  const canManage = can(active.role, "assessment.manage");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Gap analysis"
        description={
          <>
            Basata su{" "}
            <Link
              href={`/assessments/${assessment.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {assessment.title}
            </Link>
            . Una lacuna è un requisito valutato «Parziale» o «Non implementato».
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Lacune"
          value={gaps.length}
          tone={gaps.length > 0 ? "warning" : "success"}
          criterion="Requisiti «Parziale» + «Non implementato»"
        />
        {GAP_SEVERITIES.slice(0, 2).map((s) => (
          <MetricCard
            key={s.value}
            label={`Criticità ${s.label.toLowerCase()}`}
            value={gaps.filter((g) => g.severity === s.value).length}
            tone="danger"
            criterion={`Lacune classificate «${s.label}»`}
          />
        ))}
        <MetricCard
          label="Senza attività aperte"
          value={withoutTasks}
          tone={withoutTasks > 0 ? "warning" : "default"}
          criterion="Lacune senza alcuna attività correttiva aperta"
        />
      </div>
      {notAssessed > 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {notAssessed} requisiti non sono ancora stati valutati: la gap analysis è incompleta finché
          l&apos;assessment non è terminato.
        </p>
      ) : null}
      {gaps.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessuna lacuna rilevata tra i requisiti valutati.
        </p>
      ) : (
        <GapTable
          gaps={gaps}
          canClassify={canManage && assessment.status !== "archived"}
          canCreateTasks={can(active.role, "tasks.manage")}
          members={members}
        />
      )}
    </div>
  );
}
