import { z } from "zod";

import { uuidSchema } from "@/features/organizations/schemas";

const answerStatus = z.enum(["not_assessed", "implemented", "partial", "not_implemented", "not_applicable"]);
const severity = z.enum(["low", "medium", "high", "critical"]);

const optionalUuid = z
  .union([uuidSchema, z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(3, "Almeno 3 caratteri").max(200, "Massimo 200 caratteri"),
  frameworkVersionId: uuidSchema,
});

export const updateAnswerSchema = z
  .object({
    answerId: uuidSchema,
    status: answerStatus,
    justification: z.string().trim().max(4000, "Massimo 4000 caratteri"),
    ownerId: optionalUuid,
  })
  .refine((v) => !["partial", "not_applicable"].includes(v.status) || v.justification.length >= 5, {
    path: ["justification"],
    message: "Per «Parziale» e «Non applicabile» indica una motivazione (almeno 5 caratteri)",
  });

export const updateSeveritySchema = z.object({ answerId: uuidSchema, severity: severity.nullable() });

export const updateAssessmentStatusSchema = z.object({
  assessmentId: uuidSchema,
  status: z.enum(["draft", "in_progress", "completed", "archived"]),
});

export const deleteAssessmentSchema = z.object({
  assessmentId: uuidSchema,
  confirmTitle: z.string().trim().min(1, "Digita il titolo per confermare"),
});

export type UpdateAnswerInput = z.input<typeof updateAnswerSchema>;
export type CreateAssessmentInput = z.input<typeof createAssessmentSchema>;
