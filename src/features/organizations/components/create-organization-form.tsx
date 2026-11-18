"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { FieldGroup } from "@/components/ui/field";
import { createOrganizationAction } from "@/features/organizations/actions";
import { SECTORS, SIZE_CLASSES } from "@/features/organizations/constants";
import { organizationProfileSchema } from "@/features/organizations/schemas";

type Input = z.input<typeof organizationProfileSchema>;
type Output = z.output<typeof organizationProfileSchema>;

export const sectorOptions = SECTORS.map((s) => ({
  value: s.value,
  label: s.label,
  hint: s.annex ? `All. ${s.annex}` : null,
}));

export function CreateOrganizationForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(organizationProfileSchema),
    defaultValues: { name: "", vatNumber: "", sector: "not_specified", sizeClass: "not_specified" },
    mode: "onTouched",
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    // Send the raw form values: the server validates them again with the same schema.
    const result = await createOrganizationAction({ ...values, vatNumber: values.vatNumber ?? "" });
    if (!result.ok) {
      setFormError(result.error);
      applyFieldErrors(setError, result.fieldErrors);
      return;
    }
    toast.success("Organizzazione creata");
    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Crea organizzazione">
      <FieldGroup>
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <TextField
          id="name"
          label="Ragione sociale"
          autoComplete="organization"
          error={errors.name}
          {...register("name")}
        />
        <TextField
          id="vatNumber"
          label="Partita IVA (facoltativa)"
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
              description="Settori degli Allegati I e II della Direttiva (UE) 2022/2555. È un dato informativo: non determina l'applicabilità della normativa."
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
              description="Secondo la Raccomandazione 2003/361/CE."
            />
          )}
        />
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Crea organizzazione
        </Button>
      </FieldGroup>
    </form>
  );
}
