import committed from "@magellan/token/openapi.json" with { type: "json" };
import { expect, it } from "vitest";

import { openApiDocument } from "../src/document.ts";

// The committed document is what the maintainer's infra repository reads the admin contract from.
// It is emitted from the route declarations, so this fails whenever a route changes and the
// document was not re-emitted.
it("matches the routes it was emitted from", () => {
  expect(committed).toEqual(openApiDocument());
});
