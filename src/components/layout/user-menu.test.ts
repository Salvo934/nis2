import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({ signOutAction: vi.fn() }));

import { initialsOf } from "./user-menu";

describe("initialsOf", () => {
  it("uses first and last name", () => {
    expect(initialsOf("Mario Rossi", "x@y.it")).toBe("MR");
  });
  it("falls back to the email local part", () => {
    expect(initialsOf(null, "giulia.bianchi@example.com")).toBe("GB");
    expect(initialsOf("  ", "admin@example.com")).toBe("AD");
  });
});
