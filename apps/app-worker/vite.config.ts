import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev only: one origin for the SPA and the worker. Deploy and the booted tests take wrangler.jsonc
// directly, so the worker is bundled the same way in both; the build here is the client's.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: "wrangler.jsonc",
      // Ingest's store, so the dashboard reads what a local device sent.
      persistState: { path: "../../.wrangler/state" },
      // Beside ingest in `bun run dev`, which holds the default inspector port.
      inspectorPort: 9230,
      // Local dev reaches nothing on the account.
      remoteBindings: false,
    }),
  ],
  server: {
    port: 8788,
    strictPort: true,
    // D1 writes land in the store on every request; they are not source.
    watch: { ignored: ["**/.wrangler/state/**"] },
  },
});
