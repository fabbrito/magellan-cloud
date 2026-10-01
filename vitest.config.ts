import { defineConfig } from "vitest/config";

// Both homes a test has: beside its source, or under test/ when it boots workerd, D1 or R2.
// No `globals` — explicit imports keep vitest out of every test project's `types`.
// Every instant here is UTC (docs/DESIGN.md invariant 6), so a slip into local time only shows
// where local is not UTC. Pinned off UTC, and before any worker forks, so it shows on every machine.
process.env.TZ = "America/Sao_Paulo";

export default defineConfig({
  test: {
    include: ["{packages,apps,tools}/*/{src,test}/**/*.test.ts"],
  },
});
