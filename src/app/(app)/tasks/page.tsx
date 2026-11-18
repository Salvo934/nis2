import { Plus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { listMemberOptions } from "@/features/assessment/data";
import { computeTaskMetrics, todayInRome } from "@/features/assessment/metrics";
import { requireActiveOrganization } from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";
import { TaskFormDialog } from "@/features/remediation/components/task-form-dialog";
import { TasksTable } from "@/features/remediation/components/tasks-table";
import { getRequirementLabelsForAnswers, listTasks } from "@/features/remediation/data";

export const metadata: Metadata = { title: "Piano di adeguamento" };

export default async function TasksPage() {
  const { active } = await requireActiveOrganization();
  const orgId = active.organization.id;
  const [tasks, members] = await Promise.all([listTasks(orgId), listMemberOptions(orgId)]);
  const labels = await getRequirementLabelsForAnswers(
    orgId,
    tasks.flatMap((t) => (t.assessment_answer_id ? [t.assessment_answer_id] : [])),
  );
  const rows = tasks.map((t) => ({
    ...t,
    requirement: t.assessment_answer_id ? (labels.get(t.assessment_answer_id) ?? null) : null,
  }));
  const today = todayInRome();
  const m = computeTaskMetrics(tasks, today);
  const canManage = can(active.role, "tasks.manage");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Piano di adeguamento"
        description="Attività correttive con priorità, responsabile e scadenza."
        actions={
          canManage ? (
            <TaskFormDialog
              members={members}
              trigger={
                <Button>
                  <Plus /> Nuova attività
                </Button>
              }
            />
          ) : null
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Aperte" value={m.open} criterion="Stato «Da fare», «In corso» o «Bloccata»" />
        <MetricCard
          label="In ritardo"
          value={m.overdue}
          tone={m.overdue > 0 ? "danger" : "default"}
          criterion="Aperte con scadenza precedente a oggi"
        />
        <MetricCard
          label="In scadenza (30 gg)"
          value={m.dueSoon}
          tone={m.dueSoon > 0 ? "warning" : "default"}
          criterion="Aperte con scadenza tra oggi e 30 giorni"
        />
        <MetricCard label="Completate" value={m.done} tone="success" criterion="Stato «Completata»" />
      </div>
      <TasksTable tasks={rows} members={members} canManage={canManage} today={today} />
    </div>
  );
}
