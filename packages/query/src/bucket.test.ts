import { describe, expect, it } from "vitest";

import { bucketsOf, hourMs } from "./bucket.ts";

const at = (iso: string) => Date.parse(iso);

describe("hour", () => {
  it("starts on the UTC hour in a whole-hour zone", () => {
    const buckets = bucketsOf("America/Sao_Paulo", "hour");

    expect(buckets.startOf(at("2026-09-29T12:34:56.789Z"))).toBe(at("2026-09-29T12:00:00Z"));
    expect(buckets.endOf(at("2026-09-29T12:00:00Z"))).toBe(at("2026-09-29T13:00:00Z"));
  });

  it("starts on the half hour in a half-hour zone", () => {
    const buckets = bucketsOf("Asia/Kolkata", "hour");

    expect(buckets.startOf(at("2026-09-29T12:10:00Z"))).toBe(at("2026-09-29T11:30:00Z"));
  });

  it("keeps the hour a clock repeats as two buckets", () => {
    const buckets = bucketsOf("Europe/Berlin", "hour");
    // 02:30 local, first as summer time, then again as winter time.
    const summer = at("2026-10-25T00:30:00Z");
    const winter = summer + hourMs;

    expect(buckets.startOf(summer)).toBe(at("2026-10-25T00:00:00Z"));
    expect(buckets.startOf(winter)).toBe(at("2026-10-25T01:00:00Z"));
  });
});

describe("day", () => {
  it("starts at local midnight", () => {
    const buckets = bucketsOf("America/Sao_Paulo", "day");

    expect(buckets.startOf(at("2026-09-29T02:00:00Z"))).toBe(at("2026-09-28T03:00:00Z"));
    expect(buckets.endOf(at("2026-09-28T03:00:00Z"))).toBe(at("2026-09-29T03:00:00Z"));
  });

  it("starts a day that changed its clock at the offset it began with", () => {
    const buckets = bucketsOf("Europe/Berlin", "day");
    const start = at("2026-10-24T22:00:00Z");

    expect(buckets.startOf(at("2026-10-25T20:00:00Z"))).toBe(start);
    expect(buckets.endOf(start)).toBe(at("2026-10-25T23:00:00Z"));
  });

  it("ends a short day at the next midnight", () => {
    const buckets = bucketsOf("Europe/Berlin", "day");

    expect(buckets.endOf(at("2026-03-28T23:00:00Z"))).toBe(at("2026-03-29T22:00:00Z"));
  });

  it("is the UTC day in UTC", () => {
    const buckets = bucketsOf("UTC", "day");

    expect(buckets.startOf(at("2026-09-29T23:59:59.999Z"))).toBe(at("2026-09-29T00:00:00Z"));
  });
});
