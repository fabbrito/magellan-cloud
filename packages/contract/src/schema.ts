import { z } from "zod";

import { LIMITS } from "./limits.ts";

// Zod is the authoring form: it is both the runtime parser and the TypeScript types, so the two
// cannot drift, and the wire shape is emitted from it as JSON Schema (json-schema.ts) for the device
// repo to write its Rust parser against. Rust is written natively, not generated
// (docs/adr/0001-contract-authoring.md).
//
// Every composite is a named schema and the next one is built from it, so a change lands in one
// place and the shape of the wire is readable top to bottom.
//
// `description` is not prose for its own sake: JSON Schema cannot express uniqueness or a non-empty
// record, so those rules survive in the emitted document only as the description text below and stay
// enforced here.

// Pattern-bound ASCII is what keeps a manifest readable in both languages. Every numeric bound is
// interpolated from LIMITS so the reader and the parser cannot disagree.
const keyPattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const stateCodePattern = new RegExp(`^\\d{1,${LIMITS.stateCodeDigitsMax}}$`);
const manifestHashPattern = new RegExp(`^[0-9a-f]{${LIMITS.manifestHashHexLength}}$`);
const seqPattern = new RegExp(`^\\d{1,${LIMITS.seqDigitsMax}}$`);
const bootIdPattern = new RegExp(`^[0-9a-f]{${LIMITS.bootIdLengthMin},${LIMITS.bootIdLengthMax}}$`);

const keySchema = z.string().min(1).max(LIMITS.keyLengthMax).regex(keyPattern);
const unitSchema = z.string().min(1).max(LIMITS.unitLengthMax);

const stateLabelsSchema = z
  .record(z.string(), z.string().min(1).max(LIMITS.stateLabelLengthMax))
  .refine((labels) => Object.keys(labels).length <= LIMITS.stateLabelsMax, {
    message: `more than ${LIMITS.stateLabelsMax} state labels`,
  })
  .refine((labels) => Object.keys(labels).every((code) => stateCodePattern.test(code)), {
    message: "state label codes must be decimal strings",
  })
  .meta({
    description: `At most ${LIMITS.stateLabelsMax} labels, keyed by decimal codes of at most ${LIMITS.stateCodeDigitsMax} digits.`,
  });

// A gauge and a counter are both measured, so both need a unit; a state has none. Discriminating on
// `kind` makes the unit-less state and the unit-carrying gauge the only representable shapes.
const measuredMetricFields = { key: keySchema, unit: unitSchema };

const gaugeMetricSchema = z.strictObject({
  ...measuredMetricFields,
  kind: z.literal("gauge"),
});

const counterMetricSchema = z.strictObject({
  ...measuredMetricFields,
  kind: z.literal("counter"),
});

const stateMetricSchema = z.strictObject({
  key: keySchema,
  kind: z.literal("state"),
  state_labels: stateLabelsSchema.optional(),
});

export const metricSchema = z.discriminatedUnion("kind", [
  gaugeMetricSchema,
  counterMetricSchema,
  stateMetricSchema,
]);

function uniqueBy<T>(values: T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

const metricsSchema = z
  .array(metricSchema)
  .min(1)
  .max(LIMITS.metricsPerSourceMax)
  .refine((metrics) => uniqueBy(metrics, (metric) => metric.key), {
    message: "duplicate metric key",
  })
  .meta({
    description: `One to ${LIMITS.metricsPerSourceMax} metrics, each key unique within the source.`,
  });

export const sourceSchema = z
  .strictObject({ id: keySchema, metrics: metricsSchema })
  .meta({ description: "A named thing a device polls, and the metrics it declares." });

// The schema checks shape and internal consistency, never domain meaning: the cloud stores what a
// manifest declares, sight unseen (docs/DESIGN.md invariant 1).
export const manifestSchema = z
  .strictObject({
    sources: z
      .array(sourceSchema)
      .min(1)
      .max(LIMITS.sourcesMax)
      .refine((sources) => uniqueBy(sources, (source) => source.id), {
        message: "duplicate source id",
      })
      .meta({ description: `One to ${LIMITS.sourcesMax} sources, each id unique.` }),
  })
  .meta({ description: "A device's declaration of its sources and their metrics." });

const metricValuesSchema = z
  .record(z.string(), z.number())
  .refine((values) => Object.keys(values).length >= 1, {
    message: "a reading carries at least one metric value",
  })
  .refine((values) => Object.keys(values).length <= LIMITS.metricsPerSourceMax, {
    message: `more than ${LIMITS.metricsPerSourceMax} metric values`,
  })
  .meta({
    description: `One to ${LIMITS.metricsPerSourceMax} metric values, keyed by metric key.`,
  });

// One reading is one source poll: a timestamp plus that source's values, keyed so it stays readable
// as the manifest grows (docs/DESIGN.md invariant 3).
export const readingSchema = z
  .strictObject({
    source: keySchema,
    ts: z.int().min(0).max(LIMITS.timestampMsMax),
    values: metricValuesSchema,
  })
  .meta({ description: "One source poll: a UTC timestamp in ms and that source's metric values." });

export const heartbeatSchema = z
  .strictObject({
    // uptime_seconds resets on every reboot, power cut and OTA, so liveness never follows from it;
    // boot_id makes a reset explainable and needs no flash to keep.
    boot_id: z.string().regex(bootIdPattern),
    uptime_seconds: z.int().min(0).max(LIMITS.uptimeSecondsMax),
    buffer_depth: z.int().min(0).max(LIMITS.bufferDepthMax),
    battery_percent: z.int().min(0).max(LIMITS.batteryPercentMax).optional(),
    signal: z.int().min(0).max(LIMITS.signalMax).optional(),
    firmware_version: z.string().min(1).max(LIMITS.firmwareVersionLengthMax).optional(),
  })
  .meta({ description: "The device's account of itself, sent with a batch." });

// A batch is the unit of delivery, retry and dedup; seq is a decimal string because 2^53 is a cliff
// in JS, and a counter that silently rounds is a dedup that silently fails.
export const batchSchema = z
  .strictObject({
    manifest_hash: z.string().regex(manifestHashPattern),
    seq: z.string().regex(seqPattern),
    readings: z.array(readingSchema).min(1).max(LIMITS.readingsPerBatchMax),
    heartbeat: heartbeatSchema.optional(),
  })
  .meta({
    description: "One upload: ordered readings under a manifest hash, deduplicated on seq.",
  });

export type Manifest = z.infer<typeof manifestSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Reading = z.infer<typeof readingSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type Batch = z.infer<typeof batchSchema>;
