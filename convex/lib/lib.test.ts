import { describe, it, expect } from "vitest";
import { SYMBOL_KEYS } from "./symbols.ts";
import { TIERS, SYMBOLS_PER_REEL, defaultOddsDenominator, resolveTier } from "./tiers.ts";
import {
  ALL_US_JURISDICTIONS,
  ELIGIBLE_JURISDICTIONS,
  EXCLUSIONS,
  REGISTRATION_THRESHOLD_CENTS,
  isEligibleJurisdiction,
  registrationDuty,
} from "./jurisdictions.ts";

describe("tiers", () => {
  it("has a reel depth matching the symbol set", () => {
    expect(SYMBOL_KEYS.length).toBe(SYMBOLS_PER_REEL);
  });

  it("has contiguous ascending ranges with 3..8 columns", () => {
    TIERS.forEach((t, i) => {
      expect(t.tier).toBe(i + 1);
      expect(t.columns).toBe(i + 3);
      if (i > 0) expect(t.minValue).toBe(TIERS[i - 1].maxValue);
    });
    expect(TIERS.at(-1)!.maxValue).toBeNull();
  });

  it("puts boundary values on the intended side", () => {
    expect(resolveTier(10_000).tier).toBe(1); // $100 exactly
    expect(resolveTier(10_001).tier).toBe(2);
    expect(resolveTier(50_000).tier).toBe(2); // $500
    expect(resolveTier(100_000).tier).toBe(3); // $1,000
    expect(resolveTier(500_000).tier).toBe(4); // $5,000
    expect(resolveTier(1_000_000).tier).toBe(5); // $10,000
    expect(resolveTier(9_999_999).tier).toBe(6);
    expect(resolveTier(1).tier).toBe(1);
  });

  it("defaults odds to ten to the power of the column count", () => {
    expect(defaultOddsDenominator(TIERS[0])).toBe(1_000);
    expect(defaultOddsDenominator(TIERS[5])).toBe(100_000_000);
  });
});

describe("jurisdictions", () => {
  it("covers 50 states plus DC with unique codes", () => {
    expect(ALL_US_JURISDICTIONS.length).toBe(51);
    expect(new Set(ALL_US_JURISDICTIONS).size).toBe(51);
  });

  it("leaves 46 states plus DC eligible", () => {
    expect(ELIGIBLE_JURISDICTIONS.length).toBe(47);
  });

  it("gives every exclusion a real code and a real reason", () => {
    for (const e of EXCLUSIONS) {
      expect(ALL_US_JURISDICTIONS).toContain(e.code);
      expect(isEligibleJurisdiction(e.code)).toBe(false);
      expect(e.reason.length).toBeGreaterThan(40);
    }
  });

  it("matches on case and keeps Rhode Island in, territories out", () => {
    expect(isEligibleJurisdiction("ny")).toBe(true);
    expect(isEligibleJurisdiction("RI")).toBe(true);
    expect(isEligibleJurisdiction("PR")).toBe(false);
  });

  it("puts the registration cliff exactly on tier 4's ceiling", () => {
    expect(TIERS[3].maxValue).toBe(REGISTRATION_THRESHOLD_CENTS);
    expect(registrationDuty(REGISTRATION_THRESHOLD_CENTS).required).toBe(false);
    expect(registrationDuty(REGISTRATION_THRESHOLD_CENTS + 1).required).toBe(true);
    expect(registrationDuty(1_000_000).states).toEqual(["NY", "FL"]);
    expect(registrationDuty(1_000_000).leadDays).toBe(30);
  });

  it("requires registration for tiers 5 and 6 only", () => {
    for (const t of TIERS) {
      const probe = t.maxValue ?? t.minValue + 1;
      expect(registrationDuty(probe).required).toBe(t.tier >= 5);
    }
  });
});
