import { expect, it } from "vitest";

import { latestHeard, seqGaps } from "./health.ts";

const boot = (bootId: string, seqs: string[]) => seqs.map((seq) => ({ bootId, seq }));

it("counts nothing missing in an unbroken run", () => {
  expect(seqGaps(boot("a", ["0", "1", "2"]))).toBe(0);
});

it("counts the seqs skipped inside a boot", () => {
  expect(seqGaps(boot("a", ["0", "3", "4", "7"]))).toBe(4);
});

it("orders seqs numerically, not as text", () => {
  expect(seqGaps(boot("a", ["9", "10", "11"]))).toBe(0);
});

it("never counts across boots", () => {
  expect(seqGaps([...boot("a", ["0", "1"]), ...boot("b", ["0", "1"])])).toBe(0);
});

const heard = (bootId: string, receivedAt: number) => ({ bootId, receivedAt });

it("hears the later of a heartbeat and a receipt", () => {
  expect(latestHeard(heard("a", 1), heard("b", 2))).toEqual(heard("b", 2));
  expect(latestHeard(heard("b", 2), heard("a", 1))).toEqual(heard("b", 2));
});

it("hears either alone, and nothing from neither", () => {
  expect(latestHeard(heard("a", 1), undefined)).toEqual(heard("a", 1));
  expect(latestHeard(undefined, heard("a", 1))).toEqual(heard("a", 1));
  expect(latestHeard(undefined, undefined)).toBeUndefined();
});
