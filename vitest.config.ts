import { defineConfig } from "vitest/config";

// One runner at the root over colocated tests, not a config per workspace: a package earns a config
// when it needs a different environment, and none does yet.
//
// No `globals` — tests import `describe`/`it`/`expect` explicitly. Globals would mean a `types` entry
// in every package's tsconfig, and `types: []` is the mechanism keeping Bun out of packages
// (AGENTS.md).
export default defineConfig({
  test: {
    include: ["{packages,apps,tools}/*/src/**/*.test.ts"],
  },
});
