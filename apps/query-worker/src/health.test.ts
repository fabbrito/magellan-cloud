import { expect, it } from "vitest";

import { seqGaps } from "./health.ts";

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
