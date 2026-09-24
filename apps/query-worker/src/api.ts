import type { Manifest, Metric } from "@magellan/contract";

import type { Card } from "./layout.ts";
import type { Interval, Point, Run, Segment } from "./series.ts";

export type { Card, Interval, Point, Run, Segment };
export type { Problem } from "./problem.ts";

// The bodies the API answers with, and the dashboard reads. Types only, free of the Workers
// runtime and D1, so a browser build imports them without either. The routes hold theirs to these
// with `satisfies`, so the two cannot drift.

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

export interface Layout {
  name: string;
  cards: Card[];
  updated_at: number;
}
