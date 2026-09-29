import { openApiDocument as readDocument } from "@magellan/api-worker/document";
import { openApiDocument as ingestDocument } from "@magellan/ingest-worker/document";

// Writes the documents the contracts publish, each beside the package that owns its shapes: the
// ingest contract in packages/contract, the seam the device repository reads; the read contract in
// packages/query, what a client reads. The workers only happen to be where the routes are declared.
// oxfmt owns the formatting from here, and each worker's test compares the parsed document, not the
// bytes.
const documents = [
  { destination: "../../../packages/contract/openapi.json", document: ingestDocument() },
  { destination: "../../../packages/query/openapi.json", document: readDocument() },
];

for (const { destination, document } of documents) {
  await Bun.write(
    new URL(destination, import.meta.url),
    `${JSON.stringify(document, undefined, 2)}\n`,
  );
}
