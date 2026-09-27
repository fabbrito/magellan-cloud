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

// What a read answers: the body, or the refusal a route turns into a problem.
export type Answer<Body> =
  | { ok: true; body: Body }
  | { ok: false; status: 404 | 422; title: string };

// Every read under a device answers this for one never registered, before it reads anything else.
export const noDevice = { ok: false, status: 404, title: "No such device" } as const;

// The bodies the API answers with. The reads build them typed, so a route cannot drift from them.

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
