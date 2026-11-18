"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { FormAlert } from "@/components/forms/form-alert";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/features/assessment/constants";
import { createTaskAction, updateTaskAction } from "@/features/remediation/actions";
import { taskSchema } from "@/features/remediation/schemas";
import type { Tables } from "@/types/database";

type Input = z.input<typeof taskSchema>;
type Output = z.output<typeof taskSchema>;

type Props = {
  trigger: ReactNode;
  members: { value: string; label: string }[];
  task?: Tables<"remediation_tasks">;
  /** Pre-fill when creating a task from a gap. */
  gap?: { answerId: string; code: string; title: string };
};

const NONE = "__none__";

export function TaskFormDialog({ trigger, members, task, gap }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const defaults: Input = {
    title: task?.title ?? (gap ? `Colmare la lacuna ${gap.code}: ${gap.title}` : ""),
    description: task?.description ?? "",
    priority: task?.priority ?? "medium",
    status: task?.status ?? "todo",
    assigneeId: task?.assignee_id ?? "",
    dueDate: task?.due_date ?? "",
    answerId: task?.assessment_answer_id ?? gap?.answerId ?? "",
  };
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(taskSchema), defaultValues: defaults });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset(defaults);
      setFormError(null);
    }
  }

  async function onSubmit(values: Output) {
    setFormError(null);
    const payload = {
      ...values,
      assigneeId: values.assigneeId ?? "",
      dueDate: values.dueDate ?? "",
      answerId: values.answerId ?? "",
    };
    const result = task
      ? await updateTaskAction({ ...payload, taskId: task.id })
      : await createTaskAction(payload);
    if (!result.ok) {
      setFormError(result.error);
      applyFieldErrors(setError, result.fieldErrors);
      return;
    }
    toast.success(task ? "Attività aggiornata" : "Attività creata");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="contents"
          aria-label="Attività correttiva"
        >
          <DialogHeader>
            <DialogTitle>{task ? "Modifica attività" : "Nuova attività correttiva"}</DialogTitle>
            <DialogDescription>
              {gap ? `Collegata al requisito ${gap.code}.` : "Attività del piano di adeguamento."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {formError ? <FormAlert>{formError}</FormAlert> : null}
            <TextField id="task-title" label="Titolo" error={errors.title} {...register("title")} />
            <Field data-invalid={errors.description ? true : undefined}>
              <FieldLabel htmlFor="task-description">Descrizione</FieldLabel>
              <Textarea id="task-description" rows={3} {...register("description")} />
              <FieldError errors={errors.description ? [errors.description] : undefined} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <SelectField
                    id="task-priority"
                    label="Priorità"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={TASK_PRIORITIES}
                  />
                )}
              />
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <SelectField
                    id="task-status"
                    label="Stato"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={TASK_STATUSES}
                  />
                )}
              />
              <Controller
                control={control}
                name="assigneeId"
                render={({ field }) => (
                  <SelectField
                    id="task-assignee"
                    label="Responsabile"
                    value={field.value ? String(field.value) : NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                    options={[{ value: NONE, label: "Non assegnata" }, ...members]}
                    error={errors.assigneeId}
                  />
                )}
              />
              <TextField
                id="task-due"
                label="Scadenza"
                type="date"
                error={errors.dueDate}
                {...register("dueDate")}
              />
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {task ? "Salva" : "Crea attività"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
