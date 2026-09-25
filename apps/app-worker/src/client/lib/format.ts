import type { Metric } from "@magellan/query/api";

// Presentation is the cloud's: the device sends the exponent, the dashboard picks the digits from
// it, so a reading shows the precision it was sent with.
export function formatValue(value: number, metric: Metric): string {
  const digits = metric.kind === "state" ? 0 : Math.max(0, -metric.exponent);
  const number = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const unit = metric.kind === "state" ? undefined : metric.unit;
  return unit === undefined ? number : `${number} ${unit}`;
}

// A state's label as the manifest names it, else its code.
export function stateLabel(metric: Metric, code: number): string {
  if (metric.kind !== "state") return String(code);
  return metric.state_labels?.[String(code)] ?? String(code);
}

// Browser local time, always: the device's time zone never crosses the seam.
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

export function formatAge(ms: number, nowMs: number): string {
  const ageMs = Math.max(0, nowMs - ms);
  if (ageMs < minuteMs) return "just now";
  if (ageMs < hourMs) return `${Math.floor(ageMs / minuteMs)} min ago`;
  if (ageMs < dayMs) return `${Math.floor(ageMs / hourMs)} h ago`;
  return `${Math.floor(ageMs / dayMs)} d ago`;
}
