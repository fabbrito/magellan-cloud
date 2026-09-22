import type { Manifest } from "@magellan/contract";

// One source, one gauge: enough for a batch to name and for the manifest check to refuse what it
// does not declare. Bytes, not the object — the hash is over what is sent (docs/DESIGN.md §6).
export const manifest: Manifest = {
  sources: [
    { id: "inlet", metrics: [{ key: "temperature", kind: "gauge", unit: "C", exponent: -1 }] },
  ],
};

export const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
