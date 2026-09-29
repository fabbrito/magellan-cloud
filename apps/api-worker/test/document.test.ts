import committed from "@magellan/query/openapi.json" with { type: "json" };
import { expect, it } from "vitest";

import { openApiDocument } from "../src/server/document.ts";

// The committed document is what a client reads the read contract from. It is emitted from the
// route declarations, so this fails whenever a route changes and the document was not re-emitted.
it("matches the routes it was emitted from", () => {
  expect(committed).toEqual(openApiDocument());
});
