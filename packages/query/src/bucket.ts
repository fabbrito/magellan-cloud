// Buckets cut in the device's zone (docs/CONTEXT.md > Zone): an hour or a calendar day on its wall
// clock, each named by the UTC instant it starts at. A half-hour zone's hours start on the half hour.
//
// The zone's offset is asked of Intl once a bucket, never once a reading: a caller walking ascending
// instants asks `startOf` only past the last bucket's end.

export type Rollup = "reading" | "hour" | "day";

export const hourMs = 60 * 60 * 1000;
export const dayMs = 24 * hourMs;
// The longest day a zone has, at a daylight-saving fall back.
const dayMsMax = dayMs + hourMs;

export interface Buckets {
  startOf(ms: number): number;
  endOf(start: number): number;
}

// The wall clock at `ms`, read as if it were UTC, less `ms`. Whole seconds: no zone offsets by less.
function offsetMs(format: Intl.DateTimeFormat, ms: number): number {
  const fields = new Map(format.formatToParts(ms).map((part) => [part.type, Number(part.value)]));
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = fields.get(type);
    if (value === undefined) throw new Error(`no ${type} in the formatted instant`);
    return value;
  };
  const wall = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

function floorTo(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}

// `tz` is a manifest's, parsed against the same tz database, so Intl knows it.
export function bucketsOf(tz: string, rollup: "hour" | "day"): Buckets {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  if (rollup === "hour") {
    return {
      startOf: (ms) => {
        const offset = offsetMs(format, ms);
        return floorTo(ms + offset, hourMs) - offset;
      },
      endOf: (start) => start + hourMs,
    };
  }

  // Midnight's offset, not the instant's: a day that changed its clock started at the other one.
  const startOf = (ms: number): number => {
    const offset = offsetMs(format, ms);
    const midnightWall = floorTo(ms + offset, dayMs);
    return midnightWall - offsetMs(format, midnightWall - offset);
  };
  return { startOf, endOf: (start) => startOf(start + dayMsMax) };
}

// Every bucket from the one holding `fromMs` to the one holding `toMs - 1`, as `[start, end)`, and
// one past `countMax` at most, so a caller refuses a range rather than truncating it. An hour ends
// by arithmetic; only a day asks Intl, twice a bucket.
export function spansOf(
  buckets: Buckets,
  fromMs: number,
  toMs: number,
  countMax: number,
): [number, number][] {
  const spans: [number, number][] = [];
  let start = buckets.startOf(fromMs);
  while (start < toMs && spans.length <= countMax) {
    const end = buckets.endOf(start);
    spans.push([start, end]);
    start = end;
  }
  return spans;
}
