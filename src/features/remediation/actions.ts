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

export type TaskOutcome = {
  /** Requirement automatically marked "implemented" because all linked tasks are closed. */
  resolved: { code: string } | null;
  /** Requirement automatically reopened because a linked task is open again. */
  reopened: { code: string } | null;
};

/**
 * Reports what the database did to the linked requirement (see
 * supabase/migrations/*_resolve_gaps_from_tasks.sql), so the UI can say it.
 */
async function linkedOutcome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  answerId: string | null,
  before: { status: string; resolved: boolean } | null,
): Promise<TaskOutcome> {
  const none = { resolved: null, reopened: null };
  if (!answerId) return none;
  const { data: answer } = await supabase
    .from("assessment_answers")
    .select("status, resolved_by_tasks, requirement_id")
    .eq("id", answerId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!answer) return none;
  const { data: req } = await supabase
    .from("requirements")
    .select("code")
    .eq("id", answer.requirement_id)
    .maybeSingle();
  const code = req?.code ?? "";
  if (answer.resolved_by_tasks && !before?.resolved) return { resolved: { code }, reopened: null };
  if (!answer.resolved_by_tasks && before?.resolved) return { resolved: null, reopened: { code } };
  return none;
}

async function answerStateForTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  taskId: string,
) {
  const { data: task } = await supabase
    .from("remediation_tasks")
    .select("assessment_answer_id")
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const answerId = task?.assessment_answer_id ?? null;
  if (!answerId) return { answerId: null, before: null };
  const { data: answer } = await supabase
    .from("assessment_answers")
    .select("status, resolved_by_tasks")
    .eq("id", answerId)
    .maybeSingle();
  return { answerId, before: answer ? { status: answer.status, resolved: answer.resolved_by_tasks } : null };
}

function log(scope: string, error: { code?: string; message?: string } | null) {
  if (error && !dbErrorCode(error)) console.error(`[remediation] ${scope}`, error.code);
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string } & TaskOutcome>> {
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
  const outcome = await linkedOutcome(supabase, active.organization.id, v.answerId, null);
  refresh();
  return ok({ id: data.id, ...outcome });
}

export async function updateTaskAction(input: unknown): Promise<ActionResult<TaskOutcome>> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "tasks.manage")) return fail(FORBIDDEN);
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const v = parsed.data;
  const supabase = await createClient();
  const { answerId, before } = await answerStateForTask(supabase, active.organization.id, v.taskId);
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
  const outcome = await linkedOutcome(supabase, active.organization.id, answerId, before);
  refresh();
  return ok(outcome);
}

/** Quick action from the task list: mark a task as done. */
export async function completeTaskAction(taskId: unknown): Promise<ActionResult<TaskOutcome>> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "tasks.manage")) return fail(FORBIDDEN);
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { answerId, before } = await answerStateForTask(supabase, active.organization.id, parsed.data);
  const { data, error } = await supabase
    .from("remediation_tasks")
    .update({ status: "done" })
    .eq("id", parsed.data)
    .eq("organization_id", active.organization.id)
    .select("id");
  if (error) {
    log("complete", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  const outcome = await linkedOutcome(supabase, active.organization.id, answerId, before);
  refresh();
  return ok(outcome);
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
