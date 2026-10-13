import { describe, expect, it } from "vitest";
import { InventoryStatus } from "@prisma/client";
import { normalizeBrand, normalizeCondition, normalizeStatus, parseMoney } from "../src/modules/import/normalization.js";

describe("normalization", () => {
  it("normalizes brand casing without merging uncertain names", () => {
    expect(normalizeBrand(" NIKE ")).toBe("Nike");
    expect(normalizeBrand("NEW BOLUNE")).toBe("New Bolune");
  });

  it("parses Bolivian currency as decimal strings", () => {
    expect(parseMoney("350.00Bs")).toEqual({ value: "350.00", invalid: false });
    expect(parseMoney("Bs 350,50")).toEqual({ value: "350.50", invalid: false });
    expect(parseMoney("25O.00 Bs")).toEqual({ value: null, invalid: true });
  });

  it("keeps condition separate from inventory status", () => {
    expect(normalizeCondition("PREMIUM ").value).toBe("Premium");
    expect(normalizeStatus("Disponible").value).toBe(InventoryStatus.AVAILABLE);
    expect(normalizeStatus("excelente").unknown).toBe(true);
  });
});
