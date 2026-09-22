import { openApiDocument } from "@magellan/ingest-worker/document";

// Writes the document the device repository reads. It lands in packages/contract because that is
// the seam; the worker only happens to be where the routes are declared. oxfmt owns the formatting
// from here, and the worker's test compares the parsed document, not the bytes.
const destination = new URL("../../../packages/contract/openapi.json", import.meta.url);

await Bun.write(destination, `${JSON.stringify(openApiDocument(), undefined, 2)}\n`);
