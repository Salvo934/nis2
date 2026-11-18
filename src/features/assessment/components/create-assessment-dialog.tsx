"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { FieldGroup } from "@/components/ui/field";
import { createAssessmentAction } from "@/features/assessment/actions";
import { createAssessmentSchema } from "@/features/assessment/schemas";

type Input = z.input<typeof createAssessmentSchema>;
type Output = z.output<typeof createAssessmentSchema>;

type Version = { id: string; version_label: string; source_title: string };

export function CreateAssessmentDialog({
  versions,
  defaultTitle,
}: {
  versions: Version[];
  defaultTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: { title: defaultTitle, frameworkVersionId: versions[0]?.id ?? "" },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    const result = await createAssessmentAction(values);
    if (!result.ok) {
      setFormError(result.error);
      applyFieldErrors(setError, result.fieldErrors);
      return;
    }
    toast.success("Assessment creato");
    setOpen(false);
    reset();
    router.push(`/assessments/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={versions.length === 0}>
          <Plus /> Nuovo assessment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents" aria-label="Nuovo assessment">
          <DialogHeader>
            <DialogTitle>Nuovo assessment</DialogTitle>
            <DialogDescription>
              Verrà creata una valutazione con tutti i requisiti della versione del catalogo selezionata,
              inizialmente «Non valutati».
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {formError ? <FormAlert>{formError}</FormAlert> : null}
            <TextField id="assessment-title" label="Titolo" error={errors.title} {...register("title")} />
            <Controller
              control={control}
              name="frameworkVersionId"
              render={({ field }) => (
                <SelectField
                  id="assessment-version"
                  label="Catalogo normativo"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={versions.map((v) => ({
                    value: v.id,
                    label: v.source_title.split(",")[0] ?? v.version_label,
                    hint: v.version_label,
                  }))}
                  error={errors.frameworkVersionId}
                />
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Crea assessment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
