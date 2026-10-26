import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/navigation";
import {
  cn,
  formatScore,
  initials,
  PROCESSING_STATUS,
  shortId,
  titleCase,
  toIso,
} from "@/lib/utils";

describe("safeInternalPath", () => {
  it("keeps internal paths", () => {
    expect(safeInternalPath("/items/123")).toBe("/items/123");
    expect(safeInternalPath("/messages?x=1")).toBe("/messages?x=1");
  });

  it("rejects external and protocol-relative paths", () => {
    expect(safeInternalPath("https://example.com")).toBe("/");
    expect(safeInternalPath("//example.com")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("uses the fallback for empty values", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath(undefined, "/login")).toBe("/login");
    expect(safeInternalPath("", "/login")).toBe("/login");
  });
});

describe("formatting helpers", () => {
  it("builds initials safely", () => {
    expect(initials("Avery Chen")).toBe("AC");
    expect(initials("  nina   alvarez  ")).toBe("NA");
    expect(initials("Prince")).toBe("P");
    expect(initials(null)).toBe("?");
  });

  it("shortens ids", () => {
    expect(shortId("7bab6688-6681-50ed-99aa-58afaaaa9cfc")).toBe("7BAB6688");
    expect(shortId(null)).toBe("—");
  });

  it("formats scores and titles", () => {
    expect(formatScore(0.794)).toBe("79%");
    expect(formatScore(null)).toBe("—");
    expect(titleCase("CLAIM_PENDING")).toBe("Claim Pending");
    expect(titleCase(null)).toBe("");
  });

  it("converts valid dates to ISO", () => {
    expect(toIso("2026-10-25T00:00:00.000Z")).toBe("2026-10-25T00:00:00.000Z");
    expect(toIso("not-a-date")).toBeUndefined();
    expect(toIso("")).toBeUndefined();
  });

  it("merges class names", () => {
    expect(cn("px-2", "px-4", false && "hidden")).toBe("px-4");
  });
});

describe("processing status", () => {
  it("includes archived documents", () => {
    expect(PROCESSING_STATUS.ARCHIVED.label).toBe("Archived");
    expect(PROCESSING_STATUS.ARCHIVED.tone).toBe("closed");
  });
});
