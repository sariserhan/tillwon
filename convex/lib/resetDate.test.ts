import { describe, it, expect } from "vitest";
import { resetDateKey } from "./resetDate";

const at = (iso: string) => new Date(iso).getTime();

describe("resetDateKey", () => {
  it("returns an ISO-ordered day key", () => {
    expect(resetDateKey(at("2026-08-06T12:00:00Z"), "UTC", 0)).toBe("2026-08-06");
  });

  it("rolls over exactly at the reset hour in UTC", () => {
    expect(resetDateKey(at("2026-08-06T23:59:59Z"), "UTC", 0)).toBe("2026-08-06");
    expect(resetDateKey(at("2026-08-07T00:00:00Z"), "UTC", 0)).toBe("2026-08-07");
  });

  it("shifts the boundary by the reset hour", () => {
    // With a 03:00 reset, 02:00 still belongs to the previous campaign day.
    expect(resetDateKey(at("2026-08-07T02:00:00Z"), "UTC", 3)).toBe("2026-08-06");
    expect(resetDateKey(at("2026-08-07T03:00:00Z"), "UTC", 3)).toBe("2026-08-07");
  });

  it("uses the campaign timezone, not the caller's", () => {
    // 03:00 UTC is still 2026-08-06 in New York.
    expect(resetDateKey(at("2026-08-07T03:00:00Z"), "America/New_York", 0)).toBe(
      "2026-08-06",
    );
  });

  it("survives a DST transition without repeating or skipping a day", () => {
    // US DST ends 2026-11-01. Both sides must produce distinct, adjacent days.
    const before = resetDateKey(at("2026-10-31T20:00:00Z"), "America/New_York", 0);
    const after = resetDateKey(at("2026-11-01T20:00:00Z"), "America/New_York", 0);
    expect(before).toBe("2026-10-31");
    expect(after).toBe("2026-11-01");
  });
});
