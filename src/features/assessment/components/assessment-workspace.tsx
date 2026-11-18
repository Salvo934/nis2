"use client";

import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AnswerEditor } from "@/features/assessment/components/answer-editor";
import { ANSWER_STATUSES, GAP_SEVERITIES } from "@/features/assessment/constants";
import type { AssessmentItem } from "@/features/assessment/data";
import { computeAssessmentMetrics } from "@/features/assessment/metrics";

type Props = {
  items: AssessmentItem[];
  members: { value: string; label: string }[];
  canEdit: boolean;
  sourceUrl: string | null;
};

const ALL = "__all__";

export function AssessmentWorkspace({ items, members, canEdit, sourceUrl }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  const metrics = computeAssessmentMetrics(items.map((i) => i.answer));
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) map.set(i.requirement.category_code, i.requirement.category_name);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [items]);

  const filtered = items.filter((i) => {
    if (category !== ALL && i.requirement.category_code !== category) return false;
    if (status !== ALL && i.answer.status !== status) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [i.requirement.code, i.requirement.title, i.requirement.description].some((t) =>
      t.toLowerCase().includes(q),
    );
  });

  const groups = categories
    .map((c) => ({ ...c, items: filtered.filter((i) => i.requirement.category_code === c.value) }))
    .filter((g) => g.items.length > 0);

  const selected = items.find((i) => i.answer.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            Valutati {metrics.assessed} di {metrics.total} requisiti
          </p>
          <p className="text-xs text-muted-foreground">
            Avanzamento = requisiti con uno stato diverso da «Non valutato» / totale
          </p>
        </div>
        <Progress
          value={metrics.assessmentProgress}
          className="mt-3"
          aria-label="Avanzamento della valutazione"
        />
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {ANSWER_STATUSES.map((s) => (
            <li key={s.value}>
              {s.label}:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {items.filter((i) => i.answer.status === s.value).length}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per codice, titolo o testo…"
            className="h-9 pl-8"
            aria-label="Cerca requisiti"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-full md:w-72" aria-label="Filtra per categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tutte le categorie</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full md:w-48" aria-label="Filtra per stato">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tutti gli stati</SelectItem>
            {ANSWER_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessun requisito corrisponde ai filtri.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.value} aria-labelledby={`cat-${group.value}`} className="space-y-2">
            <h2 id={`cat-${group.value}`} className="text-sm font-semibold text-muted-foreground">
              {group.label}
            </h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {group.items.map(({ requirement, answer }) => (
                <li key={answer.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(answer.id)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                      {requirement.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{requirement.title}</span>
                      {answer.justification ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {answer.justification}
                        </span>
                      ) : null}
                    </span>
                    {answer.gap_severity ? (
                      <StatusBadge
                        options={GAP_SEVERITIES}
                        value={answer.gap_severity}
                        className="hidden md:inline-flex"
                      />
                    ) : null}
                    <StatusBadge options={ANSWER_STATUSES} value={answer.status} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <p className="font-mono text-xs text-muted-foreground">{selected.requirement.code}</p>
                <SheetTitle>{selected.requirement.title}</SheetTitle>
                <SheetDescription>{selected.requirement.category_name}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <AnswerEditor
                  key={`${selected.answer.id}-${selected.answer.updated_at}`}
                  item={selected}
                  members={members}
                  canEdit={canEdit}
                  sourceUrl={sourceUrl}
                  onSaved={() => setOpenId(null)}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
