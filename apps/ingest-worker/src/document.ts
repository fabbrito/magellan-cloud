import app from "./index.ts";

// Emitted, never authored: the route declarations are the only statement of the wire, so the
// document cannot drift from the worker (docs/adr/0001-contract-authoring.md). `tools/emit-openapi`
// writes it down and a test compares the two.
//
// `version` is the contract's, semver (docs/DESIGN.md §6): the major is the path's `/vN`, a minor
// adds what a device may ignore, a patch changes descriptions only. The device transcribes it.
export function openApiDocument() {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Magellan ingest", version: "1.0.0" },
  });
}
