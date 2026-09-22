import { defineConfig } from "drizzle-kit";

// drizzle-kit generates; `wrangler d1 migrations apply` applies, through the binding the Worker
// uses. `out` is wrangler.jsonc's migrations_dir — wrangler ignores drizzle's meta/ sidecar.
export default defineConfig({
  schema: "./src/schema",
  out: "./migrations",
  dialect: "sqlite",
});
