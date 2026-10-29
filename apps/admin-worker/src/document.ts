import app from "./index.ts";

// Emitted, never authored, as the read and ingest documents are (docs/adr/0001-contract-authoring.md).
// Semver from the first: the maintainer's infra repository reads it (docs/DESIGN.md §6).
export function openApiDocument() {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Magellan admin", version: "1.0.0" },
    // Every route takes the admin token.
    security: [{ adminToken: [] }],
  });
}
