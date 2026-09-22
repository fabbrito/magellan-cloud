import { expect, it } from "vitest";

import { classify } from "./outcome.ts";

// The device's own reading of docs/DESIGN.md §6, transcribed from crates/runtime/src/upload.rs in
// magellan-device. It lives here, with the simulated device, so a cloud test never asserts on the
// device's policy — the two repositories keep separate readings of the contract on purpose
// (magellan-device ADR 2).
it("drops a batch the cloud committed", () => {
  expect(classify(204)).toBe("committed");
  expect(classify(200)).toBe("committed");
});

it("keeps the buffer when the credential is refused", () => {
  expect(classify(401)).toBe("credential");
  expect(classify(403)).toBe("credential");
});

it("keeps the buffer when the cloud cannot commit now", () => {
  expect(classify(429)).toBe("unavailable");
  expect(classify(503)).toBe("unavailable");
  expect(classify(500)).toBe("unavailable");
});

it("drops a batch refused for good", () => {
  expect(classify(400)).toBe("rejected");
  expect(classify(411)).toBe("rejected");
  expect(classify(413)).toBe("rejected");
  expect(classify(422)).toBe("rejected");
});
