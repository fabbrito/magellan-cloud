import { keySchema, metricSchema } from "@magellan/contract";
import { instantSchema } from "@magellan/http";
import { z } from "zod";

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

// Null until the device is first heard: the heartbeat fields until a heartbeat, `seq` until a
// batch.
export const healthRowSchema = z.object({
  last_heard: instantSchema
    .nullable()
    .meta({ description: "When the cloud last received a heartbeat or a batch." }),
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

// One row a source the latest heartbeat names: the device's hop, beside the cloud's `last_heard`.
export const sourceHealthRowSchema = z.object({
  source: keySchema,
  last_heard: instantSchema.meta({ description: "When the device last heard the source." }),
});

export type DeviceRow = z.infer<typeof deviceRowSchema>;
export type MetricRow = z.infer<typeof metricRowSchema>;
export type ValueRow = z.infer<typeof valueRowSchema>;
export type HealthRow = z.infer<typeof healthRowSchema>;
export type SourceHealthRow = z.infer<typeof sourceHealthRowSchema>;
