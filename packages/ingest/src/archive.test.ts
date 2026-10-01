import { expect, it } from "vitest";

import { archiveKey, manifestKey } from "./archive.ts";

it("keys a batch by the UTC day it was received", () => {
  const receivedAt = new Date("2026-01-01T23:59:59.999Z");

  expect(archiveKey("device-01", "0123456789abcdef", "7", receivedAt)).toBe(
    "device-01/batches/2026/01/01/0123456789abcdef-7",
  );
});

it("pads month and day, so keys list in time order", () => {
  const receivedAt = new Date("2026-03-05T00:00:00Z");

  expect(archiveKey("device-01", "boot", "0", receivedAt)).toBe(
    "device-01/batches/2026/03/05/boot-0",
  );
});

it("keeps batches and manifests under one prefix a device, apart by kind", () => {
  expect(manifestKey("device-01", "abc")).toBe("device-01/manifests/abc");
  expect(archiveKey("device-01", "boot", "0", new Date(0))).toMatch(/^device-01\/batches\//);
});
