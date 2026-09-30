import { LIMITS } from "@magellan/contract";
import committed from "@magellan/contract/openapi.json" with { type: "json" };
import { expect, it } from "vitest";

import { openApiDocument } from "../src/document.ts";

// The committed document is what the device repository reads and writes its Rust parser against
// (docs/adr/0001-contract-authoring.md). It is emitted from the route declarations, so this fails
// whenever a route changes and the document was not re-emitted — the one drift nobody sees locally.
it("matches the routes it was emitted from", () => {
  expect(committed).toEqual(openApiDocument());
});

// JSON Schema has no keyword for a body's size, so the bound travels as an extension.
it("states each body's byte bound", () => {
  expect(committed.paths["/v1/devices/{id}/manifest"].put.requestBody).toMatchObject({
    "x-max-bytes": LIMITS.manifestBytesMax,
  });
  expect(committed.paths["/v1/devices/{id}/batches"].post.requestBody).toMatchObject({
    "x-max-bytes": LIMITS.batchBytesMax,
  });
  expect(committed.paths["/v1/devices/{id}/heartbeats"].post.requestBody).toMatchObject({
    "x-max-bytes": LIMITS.heartbeatBytesMax,
  });
});
