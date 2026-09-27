import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema/index.ts";

// D1Database is imported, not ambient: each consumer compiles this under its own runtime's types,
// and the import pins the one drizzle is typed against.
// Per request, never module scope: two requests share an instance (docs/STYLE.md).
export function getDb(database: D1Database) {
  return drizzle(database, { schema });
}

export type Db = ReturnType<typeof getDb>;
