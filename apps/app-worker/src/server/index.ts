import { keySchema } from "@magellan/contract";
import { getDb } from "@magellan/db";
import {
  currentManifest,
  type DeviceDetail,
  type DeviceSummary,
  deviceOf,
  latestHeartbeat,
  listDevices,
  readSeries,
  receiptsSince,
  seqGaps,
  seriesQuerySchema,
  windowOf,
} from "@magellan/query";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import { z } from "zod";

import { detailOf, problem } from "./problem.ts";

// Client-facing. No auth here: worker-level Cloudflare Access guards every way in — routes,
// workers.dev, previews — and a Worker with static assets never receives `ctx.access`, so there is
// nothing the worker could check. A stopgap until the platform has its own auth.
//
// Versioned: the path is what a client keeps.
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
const seriesQuery = validated("query", seriesQuerySchema);

// Every route under a device answers 404 for one never registered, before it reads anything else.
// Runs after the validators, so a malformed request is a 400 first.
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
  seriesQuery,
  knownDevice,
  async (context) => {
    const { id, source, key } = context.req.valid("param");
    const window = windowOf(context.req.valid("query"), Date.now());

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

app.notFound((context) => problem(context, 404, "No such route"));

// A fault here, not the caller's: logged for the tail, answered without its message.
app.onError((error, context) => {
  console.error(error);
  return problem(context, 500, "Internal error");
});

export default app;
