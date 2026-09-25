import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const client = "apps/app-worker/src/client";

// Both homes a test has: beside its source, or under test/ when it boots workerd, D1 or R2. The
// dashboard's run in a DOM, a project of their own.
// No `globals` — explicit imports keep vitest out of every test project's `types`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["{packages,apps,tools}/*/{src,test}/**/*.test.ts"],
          exclude: [`${client}/**`],
        },
      },
      {
        resolve: {
          alias: { "~": fileURLToPath(new URL("./apps/app-worker/src", import.meta.url)) },
        },
        test: {
          name: "client",
          environment: "happy-dom",
          include: [`${client}/**/*.test.{ts,tsx}`],
        },
      },
    ],
  },
});
