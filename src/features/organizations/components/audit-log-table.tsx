import { ScrollText } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLES, labelOf } from "@/features/organizations/constants";
import { formatDateTime } from "@/lib/format";
import type { Json } from "@/types/database";

type Row = {
  id: string;
  action: string;
  actorName: string;
  metadata: Json;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  "organization.created": "Organizzazione creata",
  "organization.updated": "Dati organizzazione modificati",
  "member.added": "Membro aggiunto",
  "member.role_changed": "Ruolo modificato",
  "member.removed": "Membro rimosso",
  "invitation.created": "Invito creato",
  "invitation.revoked": "Invito revocato",
  "invitation.accepted": "Invito accettato",
  "assessment.created": "Assessment creato",
  "assessment.status_changed": "Stato assessment modificato",
  "answer.updated": "Valutazione requisito modificata",
  "answer.auto_resolved": "Requisito implementato (automatico)",
  "answer.auto_reopened": "Requisito riaperto (automatico)",
  "task.created": "Attività creata",
  "task.status_changed": "Stato attività modificato",
  "task.deleted": "Attività eliminata",
};

const ANSWER_LABELS: Record<string, string> = {
  not_assessed: "Non valutato",
  implemented: "Implementato",
  partial: "Parziale",
  not_implemented: "Non implementato",
  not_applicable: "Non applicabile",
};

const TASK_LABELS: Record<string, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  blocked: "Bloccata",
  done: "Completata",
  cancelled: "Annullata",
  draft: "Bozza",
  completed: "Completato",
  archived: "Archiviato",
};

const FIELD_LABELS: Record<string, string> = {
  name: "ragione sociale",
  vat_number: "partita IVA",
  sector: "settore",
  size_class: "dimensione",
  nis2_classification: "classificazione NIS2",
  classification_basis: "motivazione classificazione",
};

function asRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function describeAuditEvent(action: string, metadata: Json): string {
  const m = asRecord(metadata);
  const role = (key: string) => (typeof m[key] === "string" ? labelOf(ROLES, m[key] as string) : "");
  switch (action) {
    case "organization.updated": {
      const fields = Array.isArray(m.changed_fields)
        ? m.changed_fields.map((f) => FIELD_LABELS[String(f)] ?? String(f))
        : [];
      return fields.length ? `Campi: ${fields.join(", ")}` : "";
    }
    case "member.role_changed":
      return `${role("from")} → ${role("to")}`;
    case "member.added":
      return role("role");
    case "member.removed":
      return m.self_removal === true ? "Uscita volontaria" : role("role");
    case "invitation.created":
      return `${String(m.email ?? "")} · ${role("role")}`;
    case "invitation.revoked":
    case "invitation.accepted":
      return String(m.email ?? "");
    case "answer.updated":
    case "answer.auto_resolved":
    case "answer.auto_reopened":
      return `${String(m.requirement ?? "")}: ${ANSWER_LABELS[String(m.from)] ?? m.from} → ${ANSWER_LABELS[String(m.to)] ?? m.to}`;
    case "assessment.created":
    case "task.created":
    case "task.deleted":
      return String(m.title ?? "");
    case "assessment.status_changed":
    case "task.status_changed":
      return `${String(m.title ?? "")}: ${TASK_LABELS[String(m.from)] ?? m.from} → ${TASK_LABELS[String(m.to)] ?? m.to}`;
    default:
      return "";
  }
}

export function AuditLogTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        <ScrollText className="size-5" aria-hidden="true" />
        Nessun evento registrato.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Data</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Autore</TableHead>
            <TableHead className="hidden lg:table-cell">Dettagli</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                {formatDateTime(row.created_at)}
              </TableCell>
              <TableCell className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</TableCell>
              <TableCell>{row.actorName}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {describeAuditEvent(row.action, row.metadata)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
