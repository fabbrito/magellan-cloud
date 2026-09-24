import { keySchema } from "@magellan/contract";
import { getDb, layouts, type heartbeats } from "@magellan/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import type { DeviceDetail, DeviceSummary, Heartbeat, Layout } from "./api.ts";
import { seqGaps } from "./health.ts";
import { layoutBodySchema, layoutNameSchema, undeclaredCards } from "./layout.ts";
import { detailOf, problem } from "./problem.ts";
import { readSeries, seriesQuerySchema } from "./query.ts";
import {
  currentManifest,
  deviceOf,
  latestHeartbeat,
  layoutsOf,
  layoutsPerDeviceMax,
  listDevices,
  receiptsSince,
} from "./read.ts";

// Dashboard-facing. No auth here: worker-level Cloudflare Access guards every way in — routes,
// workers.dev, previews — and a Worker with static assets never receives `ctx.access`, so there is
// nothing the worker could check. A stopgap until the platform has its own auth.
//
// Versioned though it ships with its only client: the path is what a bookmark or a script keeps.
const app = new Hono<{ Bindings: Env }>().basePath("/api/v1");

const dayMs = 24 * 60 * 60 * 1000;

function validated<Target extends "param" | "query" | "json", Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return validator(target, (value, context) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return problem(context, 400, "Malformed request", { detail: detailOf(parsed.error) });
    }
    return parsed.data;
  });
}

const deviceParam = validated("param", z.object({ id: keySchema }));
const seriesParam = validated(
  "param",
  z.object({ id: keySchema, source: keySchema, metric: keySchema }),
);
const layoutParam = validated("param", z.object({ id: keySchema, name: layoutNameSchema }));
const seriesQuery = validated("query", seriesQuerySchema);
const layoutBody = validated("json", layoutBodySchema);

function heartbeatOf(row: typeof heartbeats.$inferSelect): Heartbeat {
  return {
    boot_id: row.bootId,
    seq: row.seq,
    uptime_seconds: row.uptimeSeconds,
    buffer_depth: row.bufferDepth,
    battery_percent: row.batteryPercent,
    signal_percent: row.signalPercent,
    firmware_version: row.firmwareVersion,
    received_at: row.receivedAt,
  };
}

// Throws on a body this worker wrote and cannot read: a bug here, never the caller's.
function layoutOf(row: { name: string; body: string; updatedAt: number }): Layout {
  return {
    name: row.name,
    cards: layoutBodySchema.parse(JSON.parse(row.body)).cards,
    updated_at: row.updatedAt,
  };
}

app.get("/devices", async (context) => {
  const rows = await listDevices(getDb(context.env.DB));
  return context.json(
    rows.map((row): DeviceSummary => ({
      id: row.id,
      description: row.description,
      last_seen: row.lastSeen,
    })),
  );
});

app.get("/devices/:id", deviceParam, async (context) => {
  const { id } = context.req.valid("param");
  const db = getDb(context.env.DB);

  const device = await deviceOf(db, id);
  if (device === undefined) return problem(context, 404, "No such device");

  const [manifest, heartbeat, receipts] = await Promise.all([
    currentManifest(db, id),
    latestHeartbeat(db, id),
    receiptsSince(db, id, Date.now() - dayMs),
  ]);

  return context.json({
    id: device.id,
    description: device.description,
    manifest:
      manifest === undefined
        ? null
        : { hash: manifest.hash, declared_at: manifest.declaredAt, body: manifest.manifest },
    heartbeat: heartbeat === undefined ? null : heartbeatOf(heartbeat),
    seq_gaps: seqGaps(receipts),
  } satisfies DeviceDetail);
});

app.get(
  "/devices/:id/sources/:source/metrics/:metric/series",
  seriesParam,
  seriesQuery,
  async (context) => {
    const { id, source, metric } = context.req.valid("param");
    const window = context.req.valid("query");

    const query = { deviceId: id, source, metric, ...window };
    const result = await readSeries(getDb(context.env.DB), query);
    if (!result.ok) return problem(context, result.status, result.title);
    return context.json(result.series);
  },
);

app.get("/devices/:id/layouts", deviceParam, async (context) => {
  const { id } = context.req.valid("param");
  const rows = await layoutsOf(getDb(context.env.DB), id);
  return context.json(rows.map(layoutOf));
});

app.get("/devices/:id/layouts/:name", layoutParam, async (context) => {
  const { id, name } = context.req.valid("param");
  const rows = await layoutsOf(getDb(context.env.DB), id);

  const row = rows.find((layout) => layout.name === name);
  if (row === undefined) return problem(context, 404, "No such layout");
  return context.json(layoutOf(row));
});

// 201 when the name is new, 204 when it replaces: the same PUT, twice, lands one layout.
app.put("/devices/:id/layouts/:name", layoutParam, layoutBody, async (context) => {
  const { id, name } = context.req.valid("param");
  const body = context.req.valid("json");
  const db = getDb(context.env.DB);

  if ((await deviceOf(db, id)) === undefined) return problem(context, 404, "No such device");

  // Checked against the manifest current now; a later one dropping a key keeps the card.
  const manifest = await currentManifest(db, id);
  const undeclared =
    manifest === undefined ? body.cards : undeclaredCards(manifest.manifest, body.cards);
  if (undeclared.length > 0) {
    return problem(context, 422, "Cards name metrics the manifest does not declare", {
      undeclared,
    });
  }

  const existing = await layoutsOf(db, id);
  const replacing = existing.some((layout) => layout.name === name);
  if (!replacing && existing.length >= layoutsPerDeviceMax) {
    return problem(context, 422, `A device keeps at most ${layoutsPerDeviceMax} layouts`);
  }

  const row = { body: JSON.stringify(body), updatedAt: Date.now() };
  await db
    .insert(layouts)
    .values({ deviceId: id, name, ...row })
    .onConflictDoUpdate({ target: [layouts.deviceId, layouts.name], set: row });
  return context.body(null, replacing ? 204 : 201);
});

app.delete("/devices/:id/layouts/:name", layoutParam, async (context) => {
  const { id, name } = context.req.valid("param");
  await getDb(context.env.DB)
    .delete(layouts)
    .where(and(eq(layouts.deviceId, id), eq(layouts.name, name)));
  return context.body(null, 204);
});

app.notFound((context) => problem(context, 404, "No such route"));

// A fault here, not the caller's: logged for the tail, answered without its message.
app.onError((error, context) => {
  console.error(error);
  return problem(context, 500, "Internal error");
});

export default app;
