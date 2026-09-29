import { keySchema } from "@magellan/contract";
import { getDb } from "@magellan/db";
import {
  listDevices,
  readHealth,
  readLatest,
  readMetrics,
  readSeries,
  seriesQuerySchema,
} from "@magellan/query";
import { resolveToken } from "@magellan/token";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { detailOf, problem } from "./problem.ts";

// Client-facing. A client token is the authority on every route; the device token never reads.
//
// Versioned: the path is what a client keeps.
type Worker = { Bindings: Env };

const app = new Hono<Worker>().basePath("/v1");

// First, before any validator: a caller without a token learns nothing, not even what is malformed.
// Only a client token reads; a device token resolves to no client, like any unknown one.
app.use(async (context, next) => {
  const header = context.req.header("authorization");
  if ((await resolveToken(getDb(context.env.DB), "client", header)) === undefined) {
    context.header("www-authenticate", "Bearer");
    return problem(context, 401, "Unauthorized");
  }
  await next();
});

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

// Validators run first, so a malformed request is a 400 before any read can answer 404.
app.get("/devices", async (context) => context.json(await listDevices(getDb(context.env.DB))));

app.get("/devices/:id/metrics", deviceParam, async (context) => {
  const { id } = context.req.valid("param");
  const answer = await readMetrics(getDb(context.env.DB), id);
  if (!answer.ok) return problem(context, answer.status, answer.title);
  return context.json(answer.body);
});

app.get("/devices/:id/latest", deviceParam, async (context) => {
  const { id } = context.req.valid("param");
  const answer = await readLatest(getDb(context.env.DB), id, Date.now());
  if (!answer.ok) return problem(context, answer.status, answer.title);
  return context.json(answer.body);
});

app.get("/devices/:id/health", deviceParam, async (context) => {
  const { id } = context.req.valid("param");
  const answer = await readHealth(getDb(context.env.DB), id, Date.now());
  if (!answer.ok) return problem(context, answer.status, answer.title);
  return context.json(answer.body);
});

app.get(
  "/devices/:id/sources/:source/metrics/:key/series",
  seriesParam,
  seriesQuery,
  async (context) => {
    const { id, source, key } = context.req.valid("param");
    const query = context.req.valid("query");
    const answer = await readSeries(
      getDb(context.env.DB),
      { deviceId: id, source, key, query },
      Date.now(),
    );
    if (!answer.ok) return problem(context, answer.status, answer.title);
    return context.json(answer.body);
  },
);

app.notFound((context) => problem(context, 404, "No such route"));

// A fault here, not the caller's: logged for the tail, answered without its message.
app.onError((error, context) => {
  console.error(error);
  return problem(context, 500, "Internal error");
});

export default app;
