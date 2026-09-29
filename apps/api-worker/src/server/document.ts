import app from "./index.ts";

// Emitted, never authored: the route declarations are the only statement of the read contract, so
// the document cannot drift from the worker (docs/adr/0001-contract-authoring.md). `tools/emit-openapi`
// writes it down and a test compares the two.
//
// `version` stays "0" until the read contract is tagged; until then it is provisional.
export function openApiDocument() {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Magellan read", version: "0" },
    // Every route reads, and every read takes a client token.
    security: [{ clientToken: [] }],
  });
}
