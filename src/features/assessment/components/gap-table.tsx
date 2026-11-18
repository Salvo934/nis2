"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateGapSeverityAction } from "@/features/assessment/actions";
import { ANSWER_STATUSES, GAP_SEVERITIES } from "@/features/assessment/constants";
import { TaskFormDialog } from "@/features/remediation/components/task-form-dialog";
import type { AnswerStatus, GapSeverity } from "@/types/database";

export type GapRow = {
  answerId: string;
  code: string;
  title: string;
  category: string;
  status: AnswerStatus;
  severity: GapSeverity | null;
  justification: string | null;
  openTasks: number;
  totalTasks: number;
};

const UNSET = "__unset__";

type Props = {
  gaps: GapRow[];
  canClassify: boolean;
  canCreateTasks: boolean;
  members: { value: string; label: string }[];
};

export function GapTable({ gaps, canClassify, canCreateTasks, members }: Props) {
  const [pending, startTransition] = useTransition();

  function classify(answerId: string, value: string) {
    startTransition(async () => {
      const result = await updateGapSeverityAction({ answerId, severity: value === UNSET ? null : value });
      if (result.ok) toast.success("Criticità aggiornata");
      else toast.error(result.error);
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requisito</TableHead>
            <TableHead>Esito</TableHead>
            <TableHead className="w-44">Criticità</TableHead>
            <TableHead className="hidden md:table-cell">Attività</TableHead>
            {canCreateTasks ? (
              <TableHead className="w-12">
                <span className="sr-only">Azioni</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {gaps.map((gap) => (
            <TableRow key={gap.answerId}>
              <TableCell className="max-w-md">
                <span className="block truncate font-medium">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{gap.code}</span>
                  {gap.title}
                </span>
                {gap.justification ? (
                  <span className="block truncate text-xs text-muted-foreground">{gap.justification}</span>
                ) : null}
              </TableCell>
              <TableCell>
                <StatusBadge options={ANSWER_STATUSES} value={gap.status} />
              </TableCell>
              <TableCell>
                {canClassify ? (
                  <Select
                    value={gap.severity ?? UNSET}
                    onValueChange={(v) => classify(gap.answerId, v)}
                    disabled={pending}
                  >
                    <SelectTrigger size="sm" className="w-36" aria-label={`Criticità di ${gap.code}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>Da classificare</SelectItem>
                      {GAP_SEVERITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : gap.severity ? (
                  <StatusBadge options={GAP_SEVERITIES} value={gap.severity} />
                ) : (
                  <span className="text-xs text-muted-foreground">Da classificare</span>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {gap.totalTasks > 0 ? (
                  <Link href="/tasks" className="text-sm underline-offset-4 hover:underline">
                    {gap.openTasks} aperte / {gap.totalTasks}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">Nessuna</span>
                )}
              </TableCell>
              {canCreateTasks ? (
                <TableCell>
                  <TaskFormDialog
                    members={members}
                    gap={{ answerId: gap.answerId, code: gap.code, title: gap.title }}
                    trigger={
                      <Button variant="outline" size="icon-sm" aria-label={`Crea attività per ${gap.code}`}>
                        <Plus />
                      </Button>
                    }
                  />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
