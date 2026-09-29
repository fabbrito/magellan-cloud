import type { Metric } from "@magellan/contract";

// A refusal's body, RFC 9457.
export interface Problem {
  type: "about:blank";
  status: number;
  title: string;
  detail?: string;
}

// What a read answers: the body, or the refusal a route turns into a problem.
export type Answer<Body> =
  | { ok: true; body: Body }
  | { ok: false; status: 404 | 422; title: string };

// Every read under a device answers this for one never registered, before it reads anything else.
export const noDevice = { ok: false, status: 404, title: "No such device" } as const;

// The bodies the API answers with. The reads build them typed, so a route cannot drift from them.
// Every body is a flat array of rows, the shape a client splits into series or table columns without
// a parser of its own. Every instant is RFC 3339 UTC.

export interface DeviceRow {
  id: string;
  description: string;
  // Revoked, still read: the row keeps its history attributed.
  revoked_at: string | null;
}

// What the current manifest declares, one row a metric. Units live here, never on a value row.
// Distributed over the kinds, so each keeps its own fields.
export type MetricRow = Metric extends infer Kind
  ? Kind extends Metric
    ? { source: string; metric: string } & Omit<Kind, "key">
    : never
  : never;

// A value row: the physical quantity, or null where there is none to give.
export interface ValueRow {
  time: string | null;
  source: string;
  metric: string;
  value: number | null;
}

// The heartbeat fields are null until a first batch commits.
export interface HealthRow {
  last_seen: string | null;
  // Batches missing within a boot over the last day.
  seq_gaps: number;
  boot_id: string | null;
  seq: string | null;
  uptime_seconds: number | null;
  buffer_depth: number | null;
  battery_percent: number | null;
  signal_percent: number | null;
  firmware_version: string | null;
}
