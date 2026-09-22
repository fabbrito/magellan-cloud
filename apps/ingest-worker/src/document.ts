import app from "./index.ts";

// Emitted, never authored: the route declarations are the only statement of the wire, so the
// document cannot drift from the worker (docs/adr/0001-contract-authoring.md). `tools/emit-openapi`
// writes it down and a test compares the two.
//
// `version` stays "0" until the first `contract-v*` tag: until then the contract is provisional and
// no version is published (docs/DESIGN.md §6).
export function openApiDocument() {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Magellan ingest", version: "0" },
  });
}
