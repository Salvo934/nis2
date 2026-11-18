"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Input as TextInput } from "@/components/ui/input";
import { inviteMemberAction } from "@/features/organizations/actions";
import { ROLES } from "@/features/organizations/constants";
import { inviteMemberSchema } from "@/features/organizations/schemas";
import { formatDateTime } from "@/lib/format";

type Input = z.input<typeof inviteMemberSchema>;
type Output = z.output<typeof inviteMemberSchema>;

const roleOptions = ROLES.map((r) => ({ value: r.value, label: r.label }));

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; email: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "viewer" },
    mode: "onTouched",
  });

  const roleValue = useWatch({ control, name: "role" });
  const selectedRole = ROLES.find((r) => r.value === roleValue);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setCreated(null);
      setFormError(null);
      setCopied(false);
    }
  }

  async function onSubmit(values: Output) {
    setFormError(null);
    const result = await inviteMemberAction(values);
    if (!result.ok) {
      setFormError(result.error);
      applyFieldErrors(setError, result.fieldErrors);
      return;
    }
    setCreated({
      link: `${window.location.origin}/invite/${result.data.token}`,
      email: result.data.email,
      expiresAt: result.data.expiresAt,
    });
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invita
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Invito creato</DialogTitle>
              <DialogDescription>
                Condividi questo link con <strong className="text-foreground">{created.email}</strong>{" "}
                attraverso un canale affidabile. È personale, utilizzabile una sola volta e scade il{" "}
                {formatDateTime(created.expiresAt)}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <label htmlFor="invite-link" className="sr-only">
                Link di invito
              </label>
              <TextInput
                id="invite-link"
                readOnly
                value={created.link}
                className="h-9 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" onClick={copy} aria-label="Copia link">
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
            <FormAlert tone="info">
              Il link viene mostrato solo ora: nel database ne è conservata soltanto l&apos;impronta (hash).
              L&apos;invio automatico via email sarà disponibile in una prossima versione.
            </FormAlert>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Fatto</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            aria-label="Invita un membro"
            className="contents"
          >
            <DialogHeader>
              <DialogTitle>Invita un membro</DialogTitle>
              <DialogDescription>
                La persona dovrà accedere con questo indirizzo email per accettare l&apos;invito.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              {formError ? <FormAlert>{formError}</FormAlert> : null}
              <TextField
                id="invite-email"
                label="Email"
                type="email"
                autoComplete="off"
                placeholder="nome@azienda.it"
                error={errors.email}
                {...register("email")}
              />
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <SelectField
                    id="invite-role"
                    label="Ruolo"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={roleOptions}
                    error={errors.role}
                    description={selectedRole?.description}
                  />
                )}
              />
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Crea invito
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
