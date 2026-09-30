import { keySchema, metricSchema } from "@magellan/contract";
import { z } from "zod";

// A refusal's body, RFC 9457.
export const problemSchema = z
  .object({
    type: z.literal("about:blank"),
    status: z.int(),
    title: z.string(),
    detail: z.string().optional(),
  })
  .meta({ description: "RFC 9457. A client branches on the status, never the text." });

export type Problem = z.infer<typeof problemSchema>;

// What a read answers: the body, or the refusal a route turns into a problem. The statuses are the
// read's, so a route declares exactly the ones it can answer.
export type Answer<Body, Refusal extends 404 | 422 = 404> =
  | { ok: true; body: Body }
  | { ok: false; status: Refusal; title: string };

// Every read under a device answers this for one never registered, before it reads anything else.
export const noDevice = { ok: false, status: 404, title: "No such device" } as const;

// The bodies the API answers with, schemas so the document is emitted from what the reads build and
// a route cannot drift from either. Every body is a flat array of rows, the shape a client splits
// into series or table columns without a parser of its own.

const instantSchema = z.iso.datetime().meta({ description: "RFC 3339, UTC, to the millisecond." });

export const deviceRowSchema = z.object({
  id: keySchema,
  description: z.string(),
  revoked_at: instantSchema
    .nullable()
    .meta({ description: "Revoked, still read: the device keeps its history." }),
});

const rowLabels = { source: keySchema, metric: keySchema };
const [gaugeSchema, counterSchema, stateSchema] = metricSchema.options;

// What the current manifest declares, one row a metric, each kind with its own fields. Units live
// here, never on a value row.
export const metricRowSchema = z.discriminatedUnion("kind", [
  gaugeSchema.omit({ key: true }).extend(rowLabels),
  counterSchema.omit({ key: true }).extend(rowLabels),
  stateSchema.omit({ key: true }).extend(rowLabels),
]);

export const valueRowSchema = z
  .object({
    time: instantSchema
      .nullable()
      .meta({ description: "A reading's, or a bucket's start. Null with a null value." }),
    ...rowLabels,
    value: z.number().nullable().meta({
      description:
        "The physical quantity: scaled, a counter's raw value, a state's code. Null where none is known.",
    }),
  })
  .meta({ description: "One value, labelled by source and metric." });

// The heartbeat fields are null until a first batch commits.
export const healthRowSchema = z.object({
  last_seen: instantSchema.nullable(),
  seq_gaps: z
    .int()
    .min(0)
    .meta({ description: "Batches missing within a boot over the last day." }),
  boot_id: z.string().nullable(),
  seq: z.string().nullable(),
  uptime_seconds: z.int().nullable(),
  buffer_depth: z.int().nullable(),
  battery_percent: z.int().nullable(),
  signal_percent: z.int().nullable(),
  firmware_version: z.string().nullable(),
});

export type DeviceRow = z.infer<typeof deviceRowSchema>;
export type MetricRow = z.infer<typeof metricRowSchema>;
export type ValueRow = z.infer<typeof valueRowSchema>;
export type HealthRow = z.infer<typeof healthRowSchema>;
