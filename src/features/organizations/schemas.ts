import { z } from "zod";

import {
  NIS2_CLASSIFICATION_VALUES,
  ROLE_VALUES,
  SECTOR_VALUES,
  SIZE_CLASS_VALUES,
} from "@/features/organizations/constants";
import { normalizeItalianVat } from "@/features/organizations/vat";

// Mirrors the CHECK constraints in supabase/migrations (the DB stays the authority).

const name = z.string().trim().min(2, "Almeno 2 caratteri").max(200, "Massimo 200 caratteri");

const vatNumber = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const normalized = normalizeItalianVat(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Partita IVA non valida (11 cifre)" });
      return z.NEVER;
    }
    return normalized;
  });

export const organizationProfileSchema = z.object({
  name,
  vatNumber,
  sector: z.enum(SECTOR_VALUES, { message: "Seleziona un settore" }),
  sizeClass: z.enum(SIZE_CLASS_VALUES, { message: "Seleziona una dimensione" }),
});

export const updateOrganizationSchema = organizationProfileSchema
  .extend({
    nis2Classification: z.enum(NIS2_CLASSIFICATION_VALUES),
    classificationBasis: z.string().trim().max(2000, "Massimo 2000 caratteri"),
  })
  .refine((v) => v.nis2Classification === "not_determined" || v.classificationBasis.length >= 10, {
    path: ["classificationBasis"],
    message: "Indica su cosa si basa la classificazione (almeno 10 caratteri)",
  });

export const uuidSchema = z.uuid("Identificativo non valido");

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Inserisci un'email")
    .max(254)
    .pipe(z.email("Email non valida"))
    .transform((v) => v.toLowerCase()),
  role: z.enum(ROLE_VALUES, { message: "Seleziona un ruolo" }),
});

export const updateMemberRoleSchema = z.object({ memberId: uuidSchema, role: z.enum(ROLE_VALUES) });

export const invitationTokenSchema = z.string().regex(/^[0-9a-f]{64}$/, "Link di invito non valido");

export type OrganizationProfileInput = z.input<typeof organizationProfileSchema>;
export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;
