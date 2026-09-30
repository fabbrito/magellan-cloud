import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { keySchema } from "@magellan/contract";
import { getDb } from "@magellan/db";
import {
  deviceRowSchema,
  healthRowSchema,
  listDevices,
  metricRowSchema,
  problemSchema,
  readHealth,
  readLatest,
  readMetrics,
  readSeries,
  seriesQuerySchema,
  valueRowSchema,
  type Answer,
} from "@magellan/query";
import { resolveToken } from "@magellan/token";
import type { Context } from "hono";

import { detailOf, problem } from "./problem.ts";

// Client-facing. A client token is the authority on every route; the device token never reads.
//
// Versioned: the path is what a client keeps.
const app = new OpenAPIHono<{ Bindings: Env }>({
  // Validators run before any read, so a malformed request is a 400 before a read can answer 404.
  defaultHook: (result, context) => {
    if (!result.success) {
      return problem(context, 400, "Malformed request", {
        detail: detailOf(result.error, result.target),
      });
    }
    return undefined;
  },
});

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

app.openAPIRegistry.registerComponent("securitySchemes", "clientToken", {
  type: "http",
  scheme: "bearer",
});

const problemContent = { "application/problem+json": { schema: problemSchema } };
const refusals = {
  400: { description: "Malformed request.", content: problemContent },
  401: { description: "No client token, or one revoked.", content: problemContent },
  404: { description: "No such device.", content: problemContent },
};
const rows = <Schema extends z.ZodType>(schema: Schema, description: string) => ({
  description,
  content: { "application/json": { schema: z.array(schema) } },
});
const deviceParams = z.object({ id: keySchema });

// The read's answer, or its refusal as a problem.
function respond<Body, Refusal extends 404 | 422>(context: Context, answer: Answer<Body, Refusal>) {
  if (!answer.ok) return problem(context, answer.status, answer.title);
  return context.json(answer.body, 200);
}

const devicesRoute = createRoute({
  method: "get",
  path: "/v1/devices",
  responses: {
    200: rows(deviceRowSchema, "Every device, revoked ones too."),
    401: refusals[401],
  },
});

app.openapi(devicesRoute, async (context) =>
  context.json(await listDevices(getDb(context.env.DB)), 200),
);

const metricsRoute = createRoute({
  method: "get",
  path: "/v1/devices/{id}/metrics",
  request: { params: deviceParams },
  responses: { 200: rows(metricRowSchema, "What the current manifest declares."), ...refusals },
});

app.openapi(metricsRoute, async (context) => {
  const { id } = context.req.valid("param");
  return respond(context, await readMetrics(getDb(context.env.DB), id));
});

const latestRoute = createRoute({
  method: "get",
  path: "/v1/devices/{id}/latest",
  request: { params: deviceParams },
  responses: {
    200: rows(valueRowSchema, "Each current metric in its source's latest reading, raw."),
    ...refusals,
  },
});

app.openapi(latestRoute, async (context) => {
  const { id } = context.req.valid("param");
  return respond(context, await readLatest(getDb(context.env.DB), id, Date.now()));
});

const healthRoute = createRoute({
  method: "get",
  path: "/v1/devices/{id}/health",
  request: { params: deviceParams },
  responses: { 200: rows(healthRowSchema, "One row: the latest heartbeat and gaps."), ...refusals },
});

app.openapi(healthRoute, async (context) => {
  const { id } = context.req.valid("param");
  return respond(context, await readHealth(getDb(context.env.DB), id, Date.now()));
});

const seriesRoute = createRoute({
  method: "get",
  path: "/v1/devices/{id}/series",
  request: { params: deviceParams, query: seriesQuerySchema },
  responses: {
    200: rows(
      valueRowSchema,
      "Each asked metric's values, a reading or a bucket each, ascending by time.",
    ),
    ...refusals,
    404: {
      description: "No such device, or no manifest declares a metric.",
      content: problemContent,
    },
    422: { description: "Too many readings or rows for one read.", content: problemContent },
  },
});

app.openapi(seriesRoute, async (context) => {
  const { id } = context.req.valid("param");
  const query = context.req.valid("query");
  return respond(
    context,
    await readSeries(getDb(context.env.DB), { deviceId: id, query }, Date.now()),
  );
});

app.notFound((context) => problem(context, 404, "No such route"));

// A fault here, not the caller's: logged for the tail, answered without its message.
app.onError((error, context) => {
  console.error(error);
  return problem(context, 500, "Internal error");
});

export default app;
