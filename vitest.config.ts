import { defineConfig } from "vitest/config";

// Both homes a test has: beside its source, or under test/ when it boots workerd, D1 or R2.
// No `globals` — explicit imports keep vitest out of every test project's `types`.
export default defineConfig({
  test: {
    include: ["{packages,apps,tools}/*/{src,test}/**/*.test.ts"],
  },
});
