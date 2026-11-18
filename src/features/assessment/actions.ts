"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  createAssessmentSchema,
  updateAnswerSchema,
  updateAssessmentStatusSchema,
  updateSeveritySchema,
} from "@/features/assessment/schemas";
import { requireActiveOrganization } from "@/features/organizations/data";
import { GENERIC_ERROR, dbErrorCode, mapDbError } from "@/features/organizations/errors";
import { can } from "@/features/organizations/permissions";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

const FORBIDDEN = "Non hai i permessi per questa operazione.";
const INVALID = "Controlla i campi evidenziati.";

function log(scope: string, error: { code?: string; message?: string } | null) {
  if (error && !dbErrorCode(error)) console.error(`[assessment] ${scope}`, error.code);
}

export async function createAssessmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "assessment.manage")) return fail(FORBIDDEN);
  const parsed = createAssessmentSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_assessment", {
    p_org: active.organization.id,
    p_framework_version: parsed.data.frameworkVersionId,
    p_title: parsed.data.title,
  });
  if (error || !data) {
    log("create", error);
    return fail(mapDbError(error));
  }
  refresh();
  return ok({ id: data });
}

export async function updateAnswerAction(input: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "assessment.manage")) return fail(FORBIDDEN);
  const parsed = updateAnswerSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, z.flattenError(parsed.error).fieldErrors);

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_answers")
    .update({ status: v.status, justification: v.justification || null, owner_id: v.ownerId })
    .eq("id", v.answerId)
    .eq("organization_id", active.organization.id)
    .select("id");
  if (error) {
    log("answer", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}

export async function updateGapSeverityAction(input: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "assessment.manage")) return fail(FORBIDDEN);
  const parsed = updateSeveritySchema.safeParse(input);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_answers")
    .update({ gap_severity: parsed.data.severity })
    .eq("id", parsed.data.answerId)
    .eq("organization_id", active.organization.id)
    .in("status", ["partial", "not_implemented"])
    .select("id");
  if (error) {
    log("severity", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}

export async function updateAssessmentStatusAction(input: unknown): Promise<ActionResult> {
  const { active } = await requireActiveOrganization();
  if (!can(active.role, "assessment.manage")) return fail(FORBIDDEN);
  const parsed = updateAssessmentStatusSchema.safeParse(input);
  if (!parsed.success) return fail(GENERIC_ERROR);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.assessmentId)
    .eq("organization_id", active.organization.id)
    .select("id");
  if (error) {
    log("status", error);
    return fail(mapDbError(error));
  }
  if (data.length === 0) return fail(FORBIDDEN);
  refresh();
  return ok();
}
