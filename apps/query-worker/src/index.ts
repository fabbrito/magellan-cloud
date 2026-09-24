import { keySchema } from "@magellan/contract";
import { getDb, layouts } from "@magellan/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import { z } from "zod";

import type { DeviceDetail, DeviceSummary } from "./api.ts";
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
type Device = NonNullable<Awaited<ReturnType<typeof deviceOf>>>;
type Worker = { Bindings: Env; Variables: { device: Device } };

const app = new Hono<Worker>().basePath("/api/v1");

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
  z.object({ id: keySchema, source: keySchema, key: keySchema }),
);
const layoutParam = validated("param", z.object({ id: keySchema, name: layoutNameSchema }));
const seriesQuery = validated("query", seriesQuerySchema);
const layoutBody = validated("json", layoutBodySchema);

// Every route under a device answers 404 for one never registered, before it reads anything else.
// Runs after the param validator, so a malformed id is a 400 first.
const knownDevice = createMiddleware<Worker>(async (context, next) => {
  const device = await deviceOf(getDb(context.env.DB), context.req.param("id") ?? "");
  if (device === undefined) return problem(context, 404, "No such device");
  context.set("device", device);
  await next();
});

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

app.get("/devices/:id", deviceParam, knownDevice, async (context) => {
  const { id } = context.req.valid("param");
  const device = context.get("device");
  const db = getDb(context.env.DB);

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
    heartbeat: heartbeat ?? null,
    seq_gaps: seqGaps(receipts),
  } satisfies DeviceDetail);
});

app.get(
  "/devices/:id/sources/:source/metrics/:key/series",
  seriesParam,
  knownDevice,
  seriesQuery,
  async (context) => {
    const { id, source, key } = context.req.valid("param");
    const window = context.req.valid("query");

    const result = await readSeries(getDb(context.env.DB), {
      deviceId: id,
      source,
      key,
      ...window,
    });
    if (!result.ok) return problem(context, result.status, result.title);
    return context.json(result.series);
  },
);

app.get("/devices/:id/layouts", deviceParam, knownDevice, async (context) => {
  const { id } = context.req.valid("param");
  return context.json(await layoutsOf(getDb(context.env.DB), id));
});

app.get("/devices/:id/layouts/:name", layoutParam, knownDevice, async (context) => {
  const { id, name } = context.req.valid("param");
  const saved = await layoutsOf(getDb(context.env.DB), id);

  const layout = saved.find((each) => each.name === name);
  if (layout === undefined) return problem(context, 404, "No such layout");
  return context.json(layout);
});

// 201 when the name is new, 204 when it replaces: the same PUT, twice, lands one layout.
app.put("/devices/:id/layouts/:name", layoutParam, knownDevice, layoutBody, async (context) => {
  const { id, name } = context.req.valid("param");
  const body = context.req.valid("json");
  const db = getDb(context.env.DB);

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

app.delete("/devices/:id/layouts/:name", layoutParam, knownDevice, async (context) => {
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
