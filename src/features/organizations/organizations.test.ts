import { describe, expect, it } from "vitest";

import { pickActiveMembership, type Membership } from "./active-organization";
import { describeAuditEvent } from "./components/audit-log-table";
import { GENERIC_ERROR, mapDbError } from "./errors";
import { can } from "./permissions";
import { inviteMemberSchema, updateOrganizationSchema } from "./schemas";
import { normalizeItalianVat } from "./vat";

const m = (id: string, name: string, role: Membership["role"] = "viewer"): Membership => ({
  role,
  organization: { id, name },
});

describe("pickActiveMembership", () => {
  const memberships = [m("b", "Beta"), m("a", "Alpha"), m("c", "Gamma")];

  it("returns null without memberships", () => {
    expect(pickActiveMembership([], "a")).toBeNull();
  });
  it("honours the cookie only for organisations the user belongs to", () => {
    expect(pickActiveMembership(memberships, "c")?.organization.id).toBe("c");
    expect(pickActiveMembership(memberships, "someone-elses-org")?.organization.id).toBe("a");
  });
  it("falls back to the first organisation alphabetically", () => {
    expect(pickActiveMembership(memberships, undefined)?.organization.name).toBe("Alpha");
  });
});

describe("can (UI mirror of the RLS matrix)", () => {
  it("lets only org_admin manage members and settings", () => {
    expect(can("org_admin", "members.manage")).toBe(true);
    expect(can("security_manager", "members.manage")).toBe(false);
    expect(can("viewer", "organization.update")).toBe(false);
  });
  it("lets org_admin and auditor read the audit log", () => {
    expect(can("auditor", "audit.read")).toBe(true);
    expect(can("viewer", "audit.read")).toBe(false);
    expect(can(null, "audit.read")).toBe(false);
  });
});

describe("normalizeItalianVat", () => {
  it("accepts valid numbers with optional IT prefix and spaces", () => {
    expect(normalizeItalianVat("01234567897")).toBe("01234567897");
    expect(normalizeItalianVat("IT 012 345 678 97")).toBe("01234567897");
  });
  it("rejects wrong check digit or length", () => {
    expect(normalizeItalianVat("01234567890")).toBeNull();
    expect(normalizeItalianVat("1234")).toBeNull();
    expect(normalizeItalianVat("ABCDEFGHIJK")).toBeNull();
  });
});

describe("updateOrganizationSchema", () => {
  const base = {
    name: "Alpha S.r.l.",
    vatNumber: "",
    sector: "manufacturing",
    sizeClass: "medium",
    nis2Classification: "not_determined",
    classificationBasis: "",
  } as const;

  it("maps an empty VAT number to null", () => {
    expect(updateOrganizationSchema.parse(base).vatNumber).toBeNull();
  });
  it("requires a justification for a declared classification", () => {
    const result = updateOrganizationSchema.safeParse({ ...base, nis2Classification: "essential" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["classificationBasis"]);
  });
  it("rejects unknown sectors", () => {
    expect(updateOrganizationSchema.safeParse({ ...base, sector: "casino" }).success).toBe(false);
  });
});

describe("inviteMemberSchema", () => {
  it("normalises email and rejects unknown roles", () => {
    expect(inviteMemberSchema.parse({ email: " Erin@Alpha.IT ", role: "auditor" }).email).toBe(
      "erin@alpha.it",
    );
    expect(inviteMemberSchema.safeParse({ email: "erin@alpha.it", role: "platform_admin" }).success).toBe(
      false,
    );
  });
});

describe("mapDbError", () => {
  it("maps stable SQL error messages", () => {
    expect(mapDbError({ message: "last_org_admin", code: "P0001" })).toMatch(/almeno un amministratore/);
    expect(mapDbError({ message: "rate_limited", code: "P0001" })).toMatch(/Troppe richieste/);
  });
  it("hides raw Postgres messages", () => {
    expect(mapDbError({ message: 'duplicate key value violates unique constraint "x"', code: "23505" })).toBe(
      GENERIC_ERROR,
    );
    expect(mapDbError({ message: "permission denied for table organizations", code: "42501" })).toMatch(
      /permessi/,
    );
  });
});

describe("describeAuditEvent", () => {
  it("renders human-readable details", () => {
    expect(describeAuditEvent("member.role_changed", { from: "viewer", to: "auditor" })).toBe(
      "Lettore → Auditor",
    );
    expect(describeAuditEvent("organization.updated", { changed_fields: ["name", "sector"] })).toBe(
      "Campi: ragione sociale, settore",
    );
    expect(describeAuditEvent("unknown.event", null)).toBe("");
    expect(
      describeAuditEvent("answer.auto_resolved", {
        requirement: "DIR-21.2.b",
        from: "partial",
        to: "implemented",
      }),
    ).toBe("DIR-21.2.b: Parziale → Implementato");
    expect(describeAuditEvent("task.status_changed", { title: "Backup", from: "todo", to: "done" })).toBe(
      "Backup: Da fare → Completata",
    );
  });
});
