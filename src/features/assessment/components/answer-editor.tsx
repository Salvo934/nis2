"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { FormAlert } from "@/components/forms/form-alert";
import { SelectField } from "@/components/forms/select-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { updateAnswerAction } from "@/features/assessment/actions";
import { ANSWER_STATUSES } from "@/features/assessment/constants";
import type { AssessmentItem } from "@/features/assessment/data";
import { updateAnswerSchema } from "@/features/assessment/schemas";
import { formatDateTime } from "@/lib/format";

type Input = z.input<typeof updateAnswerSchema>;
type Output = z.output<typeof updateAnswerSchema>;

type Props = {
  item: AssessmentItem;
  members: { value: string; label: string }[];
  canEdit: boolean;
  sourceUrl: string | null;
  onSaved: () => void;
};

const NO_OWNER = "__none__";

export function AnswerEditor({ item, members, canEdit, sourceUrl, onSaved }: Props) {
  const { requirement, answer } = item;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(updateAnswerSchema),
    defaultValues: {
      answerId: answer.id,
      status: answer.status,
      justification: answer.justification ?? "",
      ownerId: answer.owner_id ?? "",
    },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    const result = await updateAnswerAction({ ...values, ownerId: values.ownerId ?? "" });
    if (!result.ok) {
      setFormError(result.error);
      applyFieldErrors(setError, result.fieldErrors);
      return;
    }
    toast.success(`${requirement.code} aggiornato`);
    onSaved();
  }

  const ownerLabel = members.find((m) => m.value === answer.owner_id)?.label;

  return (
    <div className="space-y-6">
      <section aria-labelledby="official-text" className="space-y-2">
        <h3 id="official-text" className="text-sm font-semibold">
          Testo della norma
        </h3>
        <blockquote className="rounded-lg border-l-4 border-primary/40 bg-muted/40 p-3 text-sm leading-relaxed">
          {requirement.description}
        </blockquote>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          Fonte: {requirement.source_reference}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
            >
              testo ufficiale <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </p>
      </section>

      {answer.resolved_by_tasks ? (
        <FormAlert tone="info" title="Aggiornato automaticamente">
          Segnato come «Implementato» al completamento di tutte le attività correttive collegate. Se riapri
          una di queste attività, il requisito torna alla valutazione precedente; una modifica manuale qui
          prevale sempre.
        </FormAlert>
      ) : null}

      {canEdit ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label={`Valutazione ${requirement.code}`}>
          <FieldGroup>
            {formError ? <FormAlert>{formError}</FormAlert> : null}
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <SelectField
                  id="answer-status"
                  label="Stato"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ANSWER_STATUSES}
                  error={errors.status}
                />
              )}
            />
            <Field data-invalid={errors.justification ? true : undefined}>
              <FieldLabel htmlFor="answer-justification">Motivazione</FieldLabel>
              <Textarea
                id="answer-justification"
                rows={4}
                placeholder="Su cosa si basa la valutazione: politiche, procedure, controlli in essere…"
                aria-invalid={errors.justification ? true : undefined}
                {...register("justification")}
              />
              <FieldDescription>Obbligatoria per «Parziale» e «Non applicabile».</FieldDescription>
              <FieldError errors={errors.justification ? [errors.justification] : undefined} />
            </Field>
            <Controller
              control={control}
              name="ownerId"
              render={({ field }) => (
                <SelectField
                  id="answer-owner"
                  label="Responsabile del controllo"
                  value={field.value ? String(field.value) : NO_OWNER}
                  onValueChange={(v) => field.onChange(v === NO_OWNER ? "" : v)}
                  options={[{ value: NO_OWNER, label: "Nessuno" }, ...members]}
                />
              )}
            />
            {answer.assessed_at ? (
              <p className="text-xs text-muted-foreground">
                Ultima valutazione: {formatDateTime(answer.assessed_at)}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || !isDirty}>
                {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Salva valutazione
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : (
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Stato</dt>
            <dd className="mt-1">
              <StatusBadge options={ANSWER_STATUSES} value={answer.status} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Motivazione</dt>
            <dd className="mt-1 whitespace-pre-line">{answer.justification || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Responsabile</dt>
            <dd className="mt-1">{ownerLabel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ultima valutazione</dt>
            <dd className="mt-1">{answer.assessed_at ? formatDateTime(answer.assessed_at) : "—"}</dd>
          </div>
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        Collegamento alle evidenze: disponibile con il modulo Evidenze.
      </p>
    </div>
  );
}
