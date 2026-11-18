"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireActiveOrganization } from "@/features/organizations/data";
import { GENERIC_ERROR, dbErrorCode, mapDbError } from "@/features/organizations/errors";
import { can } from "@/features/organizations/permissions";
import { uuidSchema } from "@/features/organizations/schemas";
import { taskSchema, updateTaskSchema } from "@/features/remediation/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

const FORBIDDEN = "Non hai i permessi per questa operazione.";
const INVALID = "Controlla i campi evidenziati.";

function log(scope: string, error: { code?: string; message?: string } | null) {
  if (error && !dbErrorCode(error)) console.error(`[remediation] ${scope}`, error.code);
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "tasks.manage")) return fail(FORBIDDEN);
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("remediation_tasks")
    .insert({
      // Organisation comes from the server-side context, never from the form.
      organization_id: active.organization.id,
      assessment_answer_id: v.answerId,
      title: v.title,
      description: v.description || null,
      priority: v.priority,
      status: v.status,
      assignee_id: v.assigneeId,
      due_date: v.dueDate,
    })
    .select("id")
    .single();
  if (error || !data) {
    log("create", error);
    // 23503: the linked answer belongs to another organisation (composite FK).
    return fail(error?.code === "23503" ? FORBIDDEN : mapDbError(error));
  }
  refresh();
  return ok({ id: data.id });
}

export async function updateTaskAction(input: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "tasks.manage")) return fail(FORBIDDEN);
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("remediation_tasks")
    .update({
      title: v.title,
      description: v.description || null,
      priority: v.priority,
      status: v.status,
      assignee_id: v.assigneeId,
      due_date: v.dueDate,
    })
    .eq("id", v.taskId)
    .eq("organization_id", active.organization.id)
    .select("id");
  if (error) {
    log("update", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}

export async function deleteTaskAction(taskId: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "tasks.manage")) return fail(FORBIDDEN);
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("remediation_tasks")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", active.organization.id)
    .select("id");
  if (error) {
    log("delete", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}
