import { expect, it } from "vitest";

import { archiveKey, manifestKey } from "./archive.ts";

// Tests run off UTC (vitest.config.ts): just past UTC midnight is the previous local day.
it("keys a batch by the UTC day it was received, not the local one", () => {
  const receivedAt = new Date("2026-01-02T00:00:00.000Z");

  expect(archiveKey("device-01", "0123456789abcdef", "7", receivedAt)).toBe(
    "device-01/batches/2026/01/02/0123456789abcdef-7",
  );
});

it("keeps the last instant of a UTC day in that day", () => {
  const receivedAt = new Date("2026-01-01T23:59:59.999Z");

  expect(archiveKey("device-01", "boot", "0", receivedAt)).toBe(
    "device-01/batches/2026/01/01/boot-0",
  );
});

it("pads month and day, so keys list in time order", () => {
  const receivedAt = new Date("2026-03-05T00:00:00Z");

  expect(archiveKey("device-01", "boot", "0", receivedAt)).toBe(
    "device-01/batches/2026/03/05/boot-0",
  );
});

it("keys a manifest by its hash, under its device", () => {
  expect(manifestKey("device-01", "abc")).toBe("device-01/manifests/abc");
});
