"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { FormAlert } from "@/components/forms/form-alert";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { updateOrganizationAction } from "@/features/organizations/actions";
import { NIS2_CLASSIFICATIONS, SIZE_CLASSES } from "@/features/organizations/constants";
import { sectorOptions } from "@/features/organizations/components/create-organization-form";
import { updateOrganizationSchema } from "@/features/organizations/schemas";
import { formatDateTime } from "@/lib/format";
import type { Tables } from "@/types/database";

type Input = z.input<typeof updateOrganizationSchema>;
type Output = z.output<typeof updateOrganizationSchema>;

type Props = { organization: Tables<"organizations">; canEdit: boolean };

export function OrganizationSettingsForm({ organization, canEdit }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      vatNumber: organization.vat_number ?? "",
      sector: organization.sector as Input["sector"],
      sizeClass: organization.size_class,
      nis2Classification: organization.nis2_classification,
      classificationBasis: organization.classification_basis ?? "",
    },
    mode: "onTouched",
  });

  const classification = useWatch({ control, name: "nis2Classification" });

  async function onSubmit(values: Output) {
    setFormError(null);
    const result = await updateOrganizationAction({ ...values, vatNumber: values.vatNumber ?? "" });
    if (!result.ok) {
      setFormError(result.error);
      applyFieldErrors(setError, result.fieldErrors);
      return;
    }
    reset({ ...values, vatNumber: values.vatNumber ?? "" });
    toast.success("Dati aggiornati");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Dati dell'organizzazione">
      <FieldSet disabled={!canEdit || isSubmitting} className="gap-8">
        {formError ? <FormAlert>{formError}</FormAlert> : null}

        <FieldGroup className="grid gap-6 md:grid-cols-2">
          <TextField id="name" label="Ragione sociale" error={errors.name} {...register("name")} />
          <TextField
            id="vatNumber"
            label="Partita IVA"
            inputMode="numeric"
            placeholder="11 cifre"
            error={errors.vatNumber}
            {...register("vatNumber")}
          />
          <Controller
            control={control}
            name="sector"
            render={({ field }) => (
              <SelectField
                id="sector"
                label="Settore"
                value={field.value}
                onValueChange={field.onChange}
                options={sectorOptions}
                error={errors.sector}
                disabled={!canEdit}
              />
            )}
          />
          <Controller
            control={control}
            name="sizeClass"
            render={({ field }) => (
              <SelectField
                id="sizeClass"
                label="Dimensione aziendale"
                value={field.value}
                onValueChange={field.onChange}
                options={SIZE_CLASSES}
                error={errors.sizeClass}
                disabled={!canEdit}
              />
            )}
          />
        </FieldGroup>

        <section
          aria-labelledby="classification-heading"
          className="space-y-4 rounded-xl border bg-muted/30 p-4 sm:p-5"
        >
          <div className="space-y-1">
            <h3 id="classification-heading" className="font-semibold">
              Classificazione NIS2 dichiarata
            </h3>
            <p className="flex gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              La classificazione è dichiarata dall&apos;organizzazione (ad esempio sulla base dell&apos;esito
              della registrazione presso l&apos;ACN) e deve essere motivata. NIS2 Control non la determina
              automaticamente.
            </p>
          </div>
          <FieldGroup className="grid gap-6 md:grid-cols-2">
            <Controller
              control={control}
              name="nis2Classification"
              render={({ field }) => (
                <SelectField
                  id="nis2Classification"
                  label="Classificazione"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={NIS2_CLASSIFICATIONS}
                  error={errors.nis2Classification}
                  disabled={!canEdit}
                />
              )}
            />
            <Field data-invalid={errors.classificationBasis ? true : undefined} className="md:col-span-2">
              <FieldLabel htmlFor="classificationBasis">
                Motivazione {classification === "not_determined" ? "(facoltativa)" : null}
              </FieldLabel>
              <Textarea
                id="classificationBasis"
                rows={3}
                aria-invalid={errors.classificationBasis ? true : undefined}
                aria-describedby="classificationBasis-description"
                {...register("classificationBasis")}
              />
              <FieldDescription id="classificationBasis-description">
                {organization.classification_updated_at
                  ? `Ultima modifica: ${formatDateTime(organization.classification_updated_at)}.`
                  : "Indica la fonte o il ragionamento alla base della classificazione."}
              </FieldDescription>
              <FieldError errors={errors.classificationBasis ? [errors.classificationBasis] : undefined} />
            </Field>
          </FieldGroup>
        </section>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Salva modifiche
            </Button>
          </div>
        ) : (
          <FormAlert tone="info">Solo gli amministratori possono modificare questi dati.</FormAlert>
        )}
      </FieldSet>
    </form>
  );
}
