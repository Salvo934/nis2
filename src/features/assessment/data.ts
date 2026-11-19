import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Assessment data access. All queries run as the signed-in user (RLS), and
 * every query is additionally scoped to the organisation resolved server-side
 * by requireActiveOrganization(): ids from the URL are never trusted alone.
 */

export type AssessmentItem = {
  requirement: Tables<"requirements">;
  answer: Tables<"assessment_answers">;
};

export async function listPublishedVersions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("regulatory_framework_versions")
    .select("id, version_label, source_title, source_url, scope_note, status")
    .eq("status", "published")
    .order("imported_at", { ascending: false });
  if (error) throw new Error("Impossibile caricare il catalogo normativo");
  return data;
}

export async function getVersion(versionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("regulatory_framework_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error("Impossibile caricare il catalogo normativo");
  return data;
}

export async function listAssessments(organizationId: string) {
  const supabase = await createClient();
  const [{ data: assessments, error }, { data: answers, error: answersError }] = await Promise.all([
    supabase
      .from("assessments")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase.from("assessment_answers").select("assessment_id, status").eq("organization_id", organizationId),
  ]);
  if (error || answersError) throw new Error("Impossibile caricare gli assessment");

  const byAssessment = new Map<string, { status: Tables<"assessment_answers">["status"] }[]>();
  for (const a of answers) {
    const list = byAssessment.get(a.assessment_id) ?? [];
    list.push({ status: a.status });
    byAssessment.set(a.assessment_id, list);
  }

  // Catalogue of each assessment (also retired versions, which RLS still exposes).
  const versionIds = [...new Set(assessments.map((a) => a.framework_version_id))];
  const versions = new Map<string, { version_label: string; source_title: string }>();
  if (versionIds.length > 0) {
    const { data: rows, error: versionsError } = await supabase
      .from("regulatory_framework_versions")
      .select("id, version_label, source_title")
      .in("id", versionIds);
    if (versionsError) throw new Error("Impossibile caricare il catalogo normativo");
    for (const v of rows) versions.set(v.id, v);
  }

  return assessments.map((assessment) => ({
    assessment,
    answers: byAssessment.get(assessment.id) ?? [],
    version: versions.get(assessment.framework_version_id) ?? null,
  }));
}

/** Most recent assessment that is not archived (used by dashboard and gap analysis). */
export async function getCurrentAssessment(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Impossibile caricare l'assessment");
  return data;
}

export async function getAssessment(organizationId: string, assessmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Impossibile caricare l'assessment");
  return data;
}

export async function listAssessmentItems(
  organizationId: string,
  assessment: Tables<"assessments">,
): Promise<AssessmentItem[]> {
  const supabase = await createClient();
  const [{ data: requirements, error: rErr }, { data: answers, error: aErr }] = await Promise.all([
    supabase
      .from("requirements")
      .select("*")
      .eq("framework_version_id", assessment.framework_version_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assessment_answers")
      .select("*")
      .eq("assessment_id", assessment.id)
      .eq("organization_id", organizationId),
  ]);
  if (rErr || aErr) throw new Error("Impossibile caricare i requisiti");

  const byRequirement = new Map(answers.map((a) => [a.requirement_id, a]));
  return requirements.flatMap((requirement) => {
    const answer = byRequirement.get(requirement.id);
    return answer ? [{ requirement, answer }] : [];
  });
}

export async function listMemberOptions(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, profile:profiles!inner(email, full_name)")
    .eq("organization_id", organizationId);
  if (error) throw new Error("Impossibile caricare i membri");
  return data
    .map((m) => ({ value: m.user_id, label: m.profile.full_name ?? m.profile.email }))
    .sort((a, b) => a.label.localeCompare(b.label, "it"));
}
