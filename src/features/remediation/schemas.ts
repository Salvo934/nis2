import { z } from "zod";

import { uuidSchema } from "@/features/organizations/schemas";

const optionalUuid = z
  .union([uuidSchema, z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

export const taskSchema = z.object({
  title: z.string().trim().min(3, "Almeno 3 caratteri").max(200, "Massimo 200 caratteri"),
  description: z.string().trim().max(4000, "Massimo 4000 caratteri"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
  assigneeId: optionalUuid,
  dueDate: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data non valida")
    .transform((v) => (v === "" ? null : v)),
  answerId: optionalUuid,
});

export const updateTaskSchema = taskSchema.omit({ answerId: true }).extend({ taskId: uuidSchema });

export type TaskInput = z.input<typeof taskSchema>;
