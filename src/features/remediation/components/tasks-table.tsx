"use client";

import { Check, ListTodo, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/features/assessment/constants";
import { isOpenTask, isOverdue } from "@/features/assessment/metrics";
import { completeTaskAction, deleteTaskAction } from "@/features/remediation/actions";
import { announceOutcome } from "@/features/remediation/announce-outcome";
import { TaskFormDialog } from "@/features/remediation/components/task-form-dialog";
import { formatDate } from "@/lib/format";
import type { Tables } from "@/types/database";

type Task = Tables<"remediation_tasks"> & { requirement: { code: string; title: string } | null };

type Props = {
  tasks: Task[];
  members: { value: string; label: string }[];
  canManage: boolean;
  today: string;
};

const ALL = "__all__";
const OPEN = "__open__";
const OVERDUE = "__overdue__";

export function TasksTable({ tasks, members, canManage, today }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(OPEN);
  const [priority, setPriority] = useState(ALL);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [pending, startTransition] = useTransition();
  const memberName = (id: string | null) => (id ? (members.find((m) => m.value === id)?.label ?? "—") : "—");

  const filtered = tasks.filter((t) => {
    if (status === OPEN && !isOpenTask(t.status)) return false;
    if (status === OVERDUE && !isOverdue(t, today)) return false;
    if (status !== ALL && status !== OPEN && status !== OVERDUE && t.status !== status) return false;
    if (priority !== ALL && t.priority !== priority) return false;
    const q = query.trim().toLowerCase();
    return (
      !q || [t.title, t.description ?? "", t.requirement?.code ?? ""].some((s) => s.toLowerCase().includes(q))
    );
  });

  const [completingId, setCompletingId] = useState<string | null>(null);

  function complete(task: Task) {
    setCompletingId(task.id);
    startTransition(async () => {
      const result = await completeTaskAction(task.id);
      setCompletingId(null);
      if (result.ok) announceOutcome("Attività completata", result.data);
      else toast.error(result.error);
    });
  }

  function confirmDelete() {
    const task = toDelete;
    if (!task) return;
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      setToDelete(null);
      if (result.ok) toast.success("Attività eliminata");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca attività o requisito…"
            className="h-9 pl-8"
            aria-label="Cerca attività"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full md:w-48" aria-label="Filtra per stato">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OPEN}>Aperte</SelectItem>
            <SelectItem value={OVERDUE}>In ritardo</SelectItem>
            <SelectItem value={ALL}>Tutte</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="h-9 w-full md:w-44" aria-label="Filtra per priorità">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Ogni priorità</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          <ListTodo className="size-5" aria-hidden="true" />
          {tasks.length === 0
            ? "Nessuna attività. Creane una dalla Gap analysis o con «Nuova attività»."
            : "Nessuna attività corrisponde ai filtri."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attività</TableHead>
                <TableHead>Priorità</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="hidden md:table-cell">Responsabile</TableHead>
                <TableHead>Scadenza</TableHead>
                {canManage ? (
                  <TableHead className="w-28">
                    <span className="sr-only">Azioni</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const late = isOverdue(t, today);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-md">
                      <span className="block truncate font-medium">{t.title}</span>
                      {t.requirement ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{t.requirement.code}</span> · {t.requirement.title}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge options={TASK_PRIORITIES} value={t.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge options={TASK_STATUSES} value={t.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{memberName(t.assignee_id)}</TableCell>
                    <TableCell className={late ? "font-medium text-destructive" : "text-muted-foreground"}>
                      {t.due_date ? formatDate(t.due_date) : "—"}
                      {late ? <span className="block text-xs">In ritardo</span> : null}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex gap-1">
                          {isOpenTask(t.status) ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-success hover:text-success"
                              aria-label={`Segna come completata: ${t.title}`}
                              title="Segna come completata"
                              onClick={() => complete(t)}
                              disabled={pending}
                            >
                              {completingId === t.id ? <Loader2 className="animate-spin" /> : <Check />}
                            </Button>
                          ) : null}
                          <TaskFormDialog
                            task={t}
                            members={members}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={`Modifica ${t.title}`}>
                                <Pencil />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Elimina ${t.title}`}
                            onClick={() => setToDelete(t)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare l&apos;attività?</DialogTitle>
            <DialogDescription>
              «{toDelete?.title}» verrà eliminata. L&apos;operazione resta registrata nell&apos;audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Annulla
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
