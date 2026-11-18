import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function listTasks(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("remediation_tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Impossibile caricare le attività");
  return data;
}

/** requirement code/title for each answer id linked by tasks (to show "DIR-21.2.b"). */
export async function getRequirementLabelsForAnswers(organizationId: string, answerIds: string[]) {
  const labels = new Map<string, { code: string; title: string }>();
  if (answerIds.length === 0) return labels;
  const supabase = await createClient();
  const { data: answers, error } = await supabase
    .from("assessment_answers")
    .select("id, requirement_id")
    .eq("organization_id", organizationId)
    .in("id", answerIds);
  if (error) throw new Error("Impossibile caricare i requisiti collegati");
  const reqIds = [...new Set(answers.map((a) => a.requirement_id))];
  const { data: reqs, error: rErr } = await supabase
    .from("requirements")
    .select("id, code, title")
    .in("id", reqIds);
  if (rErr) throw new Error("Impossibile caricare i requisiti collegati");
  const byReq = new Map(reqs.map((r) => [r.id, r]));
  for (const a of answers) {
    const r = byReq.get(a.requirement_id);
    if (r) labels.set(a.id, { code: r.code, title: r.title });
  }
  return labels;
}
