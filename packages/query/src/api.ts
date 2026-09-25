import type { Manifest, Metric } from "@magellan/contract";

import type { Interval, Point, Run, Segment } from "./series.ts";

export type { Interval, Point, Run, Segment };

// A refusal's body, RFC 9457.
export interface Problem {
  type: "about:blank";
  status: number;
  title: string;
  detail?: string;
}

// The bodies the API answers with. The routes hold theirs to these with `satisfies`, so the two
// cannot drift.

export interface DeviceSummary {
  id: string;
  description: string;
  last_seen: number | null;
}

export interface Heartbeat {
  boot_id: string;
  seq: string;
  uptime_seconds: number;
  buffer_depth: number;
  battery_percent: number | null;
  signal_percent: number | null;
  firmware_version: string | null;
  received_at: number;
}

export interface DeviceDetail {
  id: string;
  description: string;
  manifest: { hash: string; declared_at: number; body: Manifest } | null;
  heartbeat: Heartbeat | null;
  // Batches missing within a boot over the last day.
  seq_gaps: number;
}

export type SeriesData =
  | { kind: "gauge"; points: Point[] }
  | { kind: "counter"; intervals: Interval[]; segments: Segment[] }
  | { kind: "state"; runs: Run[] };

export interface Series {
  metric: Metric;
  // Whether the current manifest still declares it; a dropped metric charts its history.
  declared: boolean;
  data: SeriesData;
}
