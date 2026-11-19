import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ListTodo,
  SearchCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogueLabel } from "@/features/assessment/catalogues";
import { ASSESSMENT_STATUSES, TASK_PRIORITIES } from "@/features/assessment/constants";
import { getCurrentAssessment, getVersion, listAssessmentItems } from "@/features/assessment/data";
import {
  computeAssessmentMetrics,
  computeCategoryMetrics,
  computeTaskMetrics,
  isOpenTask,
  todayInRome,
} from "@/features/assessment/metrics";
import { CategoryImplementationChart, StatusDistribution } from "@/features/dashboard/charts";
import { RoleBadge } from "@/features/organizations/components/role-badge";
import { NIS2_CLASSIFICATIONS, labelOf } from "@/features/organizations/constants";
import { getOrgContext, getOrganization } from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";
import { listTasks } from "@/features/remediation/data";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, active } = await getOrgContext();
  const firstName = user.fullName?.split(" ")[0];

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Benvenuto, ${firstName}` : "Benvenuto"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Per iniziare crea la tua organizzazione oppure apri il link di invito ricevuto da un collega.
          </p>
        </div>
        <Card>
          <CardHeader>
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="pt-2">Crea la tua organizzazione</CardTitle>
            <CardDescription>
              Ragione sociale, settore e dimensione. Potrai invitare i collaboratori e assegnare i ruoli.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/organizations/new">
                Crea organizzazione <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const orgId = active.organization.id;
  const [organization, assessment, tasks] = await Promise.all([
    getOrganization(orgId),
    getCurrentAssessment(orgId),
    listTasks(orgId),
  ]);
  const [items, version] = assessment
    ? await Promise.all([listAssessmentItems(orgId, assessment), getVersion(assessment.framework_version_id)])
    : [[], null];

  const today = todayInRome();
  const m = computeAssessmentMetrics(items.map((i) => i.answer));
  const categories = computeCategoryMetrics(
    items.map((i) => ({
      status: i.answer.status,
      category_code: i.requirement.category_code,
      category_name: i.requirement.category_name,
    })),
  );
  const t = computeTaskMetrics(tasks, today);
  const deadlines = tasks
    .filter((task) => isOpenTask(task.status) && task.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{active.organization.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {firstName ? `Ciao ${firstName}.` : null} Classificazione dichiarata:{" "}
            <span className="font-medium text-foreground">
              {organization ? labelOf(NIS2_CLASSIFICATIONS, organization.nis2_classification) : "—"}
            </span>
            <RoleBadge role={active.role} />
          </p>
        </div>
        {assessment ? (
          <Button variant="outline" asChild>
            <Link href={`/assessments/${assessment.id}`}>
              Apri assessment <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </div>

      {!assessment ? (
        <Card>
          <CardHeader>
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="pt-2">Avvia il primo assessment</CardTitle>
            <CardDescription>
              Le metriche della dashboard vengono calcolate dalle risposte dell&apos;assessment e dalle
              attività del piano di adeguamento. Finché non ci sono dati, non mostriamo numeri.
            </CardDescription>
          </CardHeader>
          {can(active.role, "assessment.manage") ? (
            <CardContent>
              <Button asChild>
                <Link href="/assessments">
                  Vai agli assessment <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <>
          <section aria-label="Indicatori principali" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Requisiti applicabili"
              value={m.applicable}
              icon={ClipboardList}
              criterion={`${m.total} requisiti nel catalogo − ${m.notApplicable} dichiarati non applicabili`}
            />
            <MetricCard
              label="Implementati"
              value={`${m.implementationRate}%`}
              icon={CheckCircle2}
              tone="success"
              criterion={`${m.implemented} implementati / ${m.applicable} applicabili (i parziali contano 0)`}
            />
            <MetricCard
              label="Lacune"
              value={m.gaps}
              icon={SearchCheck}
              tone={m.gaps > 0 ? "warning" : "default"}
              criterion={`${m.partial} parziali + ${m.notImplemented} non implementati`}
            />
            <MetricCard
              label="Attività aperte"
              value={t.open}
              icon={ListTodo}
              tone={t.overdue > 0 ? "danger" : "default"}
              criterion={t.overdue > 0 ? `di cui ${t.overdue} in ritardo` : "Nessuna in ritardo"}
            />
          </section>

          {m.notAssessed > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              {m.notAssessed} requisiti su {m.total} non sono ancora stati valutati: gli indicatori sono
              parziali.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Esiti della valutazione</CardTitle>
                <CardDescription>
                  {assessment.title} · <StatusBadge options={ASSESSMENT_STATUSES} value={assessment.status} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatusDistribution
                  total={m.total}
                  segments={[
                    {
                      key: "implemented",
                      label: "Implementati",
                      count: m.implemented,
                      color: "var(--success)",
                    },
                    { key: "partial", label: "Parziali", count: m.partial, color: "var(--warning)" },
                    {
                      key: "not_implemented",
                      label: "Non implementati",
                      count: m.notImplemented,
                      color: "var(--destructive)",
                    },
                    {
                      key: "not_applicable",
                      label: "Non applicabili",
                      count: m.notApplicable,
                      color: "var(--chart-5)",
                    },
                    {
                      key: "not_assessed",
                      label: "Non valutati",
                      count: m.notAssessed,
                      color: "var(--border)",
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Implementazione per categoria</CardTitle>
                <CardDescription>
                  Implementati / applicabili in ciascuna categoria del catalogo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryImplementationChart categories={categories} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
                Prossime scadenze
              </CardTitle>
              <CardDescription>
                Attività aperte con scadenza, in ordine di data · {t.dueSoon} in scadenza nei prossimi 30
                giorni
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna attività aperta con scadenza.</p>
              ) : (
                <ul className="divide-y">
                  {deadlines.map((task) => {
                    const late = task.due_date! < today;
                    return (
                      <li key={task.id} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        <StatusBadge
                          options={TASK_PRIORITIES}
                          value={task.priority}
                          className="hidden sm:inline-flex"
                        />
                        <span
                          className={
                            late
                              ? "font-medium text-destructive tabular-nums"
                              : "text-muted-foreground tabular-nums"
                          }
                        >
                          {formatDate(task.due_date!)}
                          {late ? " · in ritardo" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button variant="link" asChild className="mt-2 px-0">
                <Link href="/tasks">Piano di adeguamento</Link>
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Dati calcolati il {formatDateTime(new Date())} dalle risposte dell&apos;assessment «
            {assessment.title}» e dalle attività registrate. Catalogo:{" "}
            {version ? catalogueLabel(version) : "—"} (versione{" "}
            <span className="font-mono">{version?.version_label ?? "—"}</span>). Gli indicatori misurano
            l&apos;avanzamento di valutazioni autodichiarate e non costituiscono una certificazione di
            conformità.
          </p>
        </>
      )}
    </div>
  );
}
