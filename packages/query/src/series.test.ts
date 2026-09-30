import { describe, expect, it } from "vitest";

import { scale } from "./series.ts";

describe("scale", () => {
  it("scales down by an exact power of ten", () => {
    expect(scale(1234, -2)).toBe(12.34);
  });

  it("scales up", () => {
    expect(scale(12, 3)).toBe(12_000);
  });
});
