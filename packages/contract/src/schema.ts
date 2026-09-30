import { z } from "zod";

import { LIMITS } from "./limits.ts";

// Zod is the authoring form: it is both the runtime parser and the TypeScript types, so the two
// cannot drift, and the wire shape is emitted from it as OpenAPI, once the endpoints exist, for the
// device repo to write its Rust parser against. Rust is written natively, not generated
// (docs/adr/0001-contract-authoring.md).
//
// Every composite is a named schema and the next one is built from it, so a change lands in one
// place and the shape of the wire is readable top to bottom.
//
// `description` is not prose for its own sake: JSON Schema has no keyword for uniqueness by
// property, so unique source ids and unique metric keys survive in the emitted document only as the
// description text below and stay enforced here. What does have a keyword — a non-empty record, a
// bound, a pattern — is carried in `.meta()` instead, where the device can assert it.

// Pattern-bound ASCII is what keeps a manifest readable in both languages. Every numeric bound is
// interpolated from LIMITS so the reader and the parser cannot disagree.
//
// Keys are URL-unreserved characters only, so a source id or metric key is a path segment as is,
// never escaped. The first character is never `.`, so no key is a `.` or `..` segment.
const keyPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const stateCodePattern = new RegExp(`^\\d{1,${LIMITS.stateCodeDigitsMax}}$`);
const manifestHashPattern = new RegExp(`^[0-9a-f]{${LIMITS.manifestHashHexLength}}$`);
// Leading zeros would spell one seq two ways, and a gap would then read as a loss the device never
// had, so the canonical decimal is the only accepted form.
const seqPattern = new RegExp(`^(0|[1-9]\\d{0,${LIMITS.seqDigitsMax - 1}})$`);
// An IANA name's characters, so an offset (`+03:00`) or an abbreviation with a space never parses.
const tzPattern = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;
const bootIdPattern = new RegExp(`^[0-9a-f]{${LIMITS.bootIdLengthMin},${LIMITS.bootIdLengthMax}}$`);

export const keySchema = z.string().min(1).max(LIMITS.keyLengthMax).regex(keyPattern);
const unitSchema = z.string().min(1).max(LIMITS.unitLengthMax);
const bootIdSchema = z.string().regex(bootIdPattern);

const stateLabelsSchema = z
  .record(z.string(), z.string().min(1).max(LIMITS.stateLabelLengthMax))
  .refine((labels) => Object.keys(labels).length <= LIMITS.stateLabelsMax, {
    message: `more than ${LIMITS.stateLabelsMax} state labels`,
  })
  .refine((labels) => Object.keys(labels).every((code) => stateCodePattern.test(code)), {
    message: "state label codes must be decimal strings",
  })
  .meta({
    maxProperties: LIMITS.stateLabelsMax,
    propertyNames: { type: "string", pattern: stateCodePattern.source },
    description: `At most ${LIMITS.stateLabelsMax} labels, keyed by decimal codes of at most ${LIMITS.stateCodeDigitsMax} digits.`,
  });

// A gauge and a counter are both measured, so both carry an exponent; a state has neither — its
// value is a code. Discriminating on `kind` makes those the only shapes.
//
// `unit` is optional: an unnamed unit and a unitless quantity are one value on the wire. `exponent`
// stays required, being orthogonal — a power factor of 0.98 is `98` at `exponent: -2`.
//
// The physical value is `value × 10^exponent`, the shape money uses: a published decimal factor
// folds in exactly on the device, so no float crosses the wire (docs/adr/0002-integer-values.md).
// The exponent is the metric's, so re-scaling one is a new manifest.
const exponentSchema = z.int().min(LIMITS.exponentMin).max(LIMITS.exponentMax).meta({
  description: "Decimal exponent of this metric's values: the value is scaled by 10^exponent.",
});

const measuredMetricFields = {
  key: keySchema,
  unit: unitSchema.optional(),
  exponent: exponentSchema,
};

const gaugeMetricSchema = z.strictObject({
  ...measuredMetricFields,
  kind: z.literal("gauge"),
});

// Only the cadence crosses the wire, never the boundary: the cloud finds a reset by the decrease,
// so no clock has to agree across the seam (docs/adr/0005-the-device-owns-meaning.md). The
// manifest's zone cuts calendar days for reads, never finds a reset.
const resetsSchema = z.enum(["daily"]).meta({
  description: "The cadence this counter resets on. The boundary is not sent; a decrease marks it.",
});

const counterMetricSchema = z
  .strictObject({
    ...measuredMetricFields,
    kind: z.literal("counter"),
    resets: resetsSchema.optional(),
  })
  .meta({
    description:
      "Monotonic between resets. Any decrease is a reset, declared or not: a restart or a wrap reads the same.",
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
// The pattern is what the document carries; that the zone exists is checked here, against the
// runtime's tz database. The device checks against its own, so a zone newer than either is refused.
const tzSchema = z
  .string()
  .min(1)
  .max(LIMITS.tzLengthMax)
  .regex(tzPattern)
  .refine(isKnownZone, { message: "not a known IANA time zone" })
  .meta({
    description:
      "The device's IANA time zone, e.g. America/Sao_Paulo. Calendar days are cut in it.",
  });

function isKnownZone(tz: string): boolean {
  // Throws a RangeError on a zone the database does not hold.
  try {
    return new Intl.DateTimeFormat("en", { timeZone: tz }).resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
}

export const manifestSchema = z
  .strictObject({
    tz: tzSchema,
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

// Integral by construction, so the manifest check has no fractional case left to refuse.
const metricValueSchema = z
  .int()
  .min(LIMITS.metricValueMin)
  .max(LIMITS.metricValueMax)
  .meta({ description: "An integer; the physical value is this scaled by its metric's exponent." });

const metricValuesSchema = z
  .record(z.string(), metricValueSchema)
  .refine((values) => Object.keys(values).length >= 1, {
    message: "a reading carries at least one metric value",
  })
  .refine((values) => Object.keys(values).length <= LIMITS.metricsPerSourceMax, {
    message: `more than ${LIMITS.metricsPerSourceMax} metric values`,
  })
  .meta({
    minProperties: 1,
    maxProperties: LIMITS.metricsPerSourceMax,
    description: `One to ${LIMITS.metricsPerSourceMax} metric values, keyed by metric key.`,
  });

// One reading is one source poll: a timestamp plus that source's values, keyed so it stays readable
// as the manifest grows (docs/DESIGN.md invariant 3).
const timestampSchema = z.int().min(0).max(LIMITS.timestampMsMax);

export const readingSchema = z
  .strictObject({
    source: keySchema,
    ts: timestampSchema,
    values: metricValuesSchema,
  })
  .meta({ description: "One source poll: a UTC timestamp in ms and that source's metric values." });

// A batch is the unit of delivery and retry; the reading is the unit of dedup
// (docs/adr/0003-dedup-is-the-readings-own-key.md). seq is a decimal string because 2^53 is a cliff
// in JS, and a counter that silently rounds is gap detection that silently lies. u64::MAX is the
// ceiling the device's counter can reach, so the pattern's 20 digits are narrowed to it here. It
// restarts at zero every boot, so it identifies a batch only beside boot_id.
const seqSchema = z
  .string()
  .regex(seqPattern)
  .refine((seq) => BigInt(seq) <= LIMITS.seqMax, { message: "seq past u64::MAX" })
  .meta({
    description: "A counter, monotonic within one boot: canonical decimal, at most u64::MAX.",
  });

export const batchSchema = z
  .strictObject({
    manifest_hash: z.string().regex(manifestHashPattern),
    // Drawn once per boot, needing no flash to keep.
    boot_id: bootIdSchema,
    seq: seqSchema,
    readings: z.array(readingSchema).min(1).max(LIMITS.readingsPerBatchMax),
  })
  .meta({
    description:
      "One upload: ordered readings under a manifest hash, identified by boot_id and seq. A duplicate is absorbed per reading, not per batch.",
  });

// Checked by pattern only, never against a manifest: a heartbeat names none, and may come before
// the first declare. Measured on the device's clock, like a reading's `ts`.
const sourcesLastHeardSchema = z
  .record(keySchema, timestampSchema)
  .refine((heard) => Object.keys(heard).length <= LIMITS.sourcesMax, {
    message: `more than ${LIMITS.sourcesMax} sources`,
  })
  .meta({
    maxProperties: LIMITS.sourcesMax,
    propertyNames: {
      type: "string",
      minLength: 1,
      maxLength: LIMITS.keyLengthMax,
      pattern: keyPattern.source,
    },
    description: `When the device last heard each source, UTC ms, keyed by source id. At most ${LIMITS.sourcesMax}; a source not heard since boot is absent.`,
  });

// Apart from any batch, so a device with nothing to read still says it is alive
// (docs/adr/0007-the-heartbeat-is-apart-from-data.md). Live state, not record: never archived.
export const heartbeatSchema = z
  .strictObject({
    // The same as this boot's batches; it explains an uptime reset.
    boot_id: bootIdSchema,
    // Resets on every reboot, power cut and OTA.
    uptime_seconds: z.int().min(0).max(LIMITS.uptimeSecondsMax),
    buffer_depth: z
      .int()
      .min(0)
      .max(LIMITS.bufferDepthMax)
      .meta({ description: "Batches pending on the device when sent." }),
    battery_percent: z.int().min(0).max(LIMITS.batteryPercentMax).optional(),
    signal_percent: z.int().min(0).max(LIMITS.signalPercentMax).optional(),
    firmware_version: z.string().min(1).max(LIMITS.firmwareVersionLengthMax).optional(),
    sources_last_heard: sourcesLastHeardSchema,
  })
  .meta({ description: "The device's account of itself, sent on its own cadence." });

export type Manifest = z.infer<typeof manifestSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Reading = z.infer<typeof readingSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type Batch = z.infer<typeof batchSchema>;
