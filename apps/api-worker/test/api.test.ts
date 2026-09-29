import type { Manifest } from "@magellan/contract";
import type { DeviceRow, HealthRow, MetricRow, Series, ValueRow } from "@magellan/query";
import { daysManifest, daysReadings, energyStep } from "@magellan/simulator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import {
  bootDevice,
  getJson,
  read,
  registerClient,
  registerDevice,
  revokeClient,
  revokeDevice,
  startCloud,
} from "./harness.ts";

let server: TestHarness;
let clientToken: string;

beforeAll(async () => {
  server = await startCloud();
  clientToken = await registerClient(server, "grafana");
});

afterAll(async () => {
  await server.close();
});

const periodMs = 300_000;
const firstTs = Date.UTC(2026, 0, 1);
const lastTs = firstTs + 8 * periodMs;

const seriesPath = (
  deviceId: string,
  source: string,
  metric: string,
  window = `from=${firstTs}&to=${lastTs}`,
) => `/v1/devices/${deviceId}/sources/${source}/metrics/${metric}/series?${window}`;

// Two days of the simulator's daily counter, sent as one batch through ingest.
async function sendDays(deviceId: string, fromTs = firstTs): Promise<void> {
  const token = await registerDevice(server, deviceId);
  const device = bootDevice(server, {
    deviceId,
    token,
    manifest: daysManifest,
    bootId: "0123456789abcdef",
  });
  await device.declare();
  const readings = daysReadings({ firstTs: fromTs, periodMs, readingsPerDay: 4, days: 2 });
  for (const reading of readings) device.poll(reading.source, reading.ts, reading.values);
  if ((await device.flush(60)) !== "committed") throw new Error("the days did not commit");
}

const withPower = (exponent: number, extra: Manifest["sources"][number]["metrics"] = []) => ({
  tz: "UTC",
  sources: [
    {
      id: "source_1",
      metrics: [{ key: "power", kind: "gauge" as const, unit: "W", exponent }, ...extra],
    },
  ],
});

const instant = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

describe("devices", () => {
  it("lists a device, and a revoked one with when it was revoked", async () => {
    await sendDays("device-01");
    await registerDevice(server, "device-gone");
    await revokeDevice(server, "device-gone");

    const devices = await getJson<DeviceRow[]>(server, clientToken, "/v1/devices");

    expect(devices).toContainEqual({
      id: "device-01",
      description: "device device-01",
      revoked_at: null,
    });
    expect(devices).toContainEqual(
      expect.objectContaining({ id: "device-gone", revoked_at: instant }),
    );
  });

  it("lists the current manifest's metrics, one row each", async () => {
    await sendDays("device-02");

    const metrics = await getJson<MetricRow[]>(
      server,
      clientToken,
      "/v1/devices/device-02/metrics",
    );

    expect(metrics).toEqual([
      { source: "source_1", metric: "power", kind: "gauge", unit: "W", exponent: 0 },
      {
        source: "source_1",
        metric: "energy_today",
        kind: "counter",
        unit: "kWh",
        exponent: -2,
        resets: "daily",
      },
      {
        source: "source_1",
        metric: "mode",
        kind: "state",
        state_labels: { "0": "idle", "1": "running" },
      },
    ]);
  });

  it("lists no metrics for a device yet to declare", async () => {
    await registerDevice(server, "device-mute");

    expect(await getJson(server, clientToken, "/v1/devices/device-mute/metrics")).toEqual([]);
  });

  it("answers each metric's latest value, scaled, a counter raw", async () => {
    await sendDays("device-08", Date.now() - 8 * periodMs);

    const latest = await getJson<ValueRow[]>(server, clientToken, "/v1/devices/device-08/latest");

    expect(latest).toEqual([
      { time: instant, source: "source_1", metric: "power", value: 600 },
      { time: instant, source: "source_1", metric: "energy_today", value: (4 * energyStep) / 100 },
      { time: instant, source: "source_1", metric: "mode", value: 1 },
    ]);
  });

  it("answers null for a source silent past the lookback", async () => {
    await sendDays("device-09");

    const latest = await getJson<ValueRow[]>(server, clientToken, "/v1/devices/device-09/latest");

    expect(latest).toContainEqual({ time: null, source: "source_1", metric: "power", value: null });
  });

  it("answers health from the latest heartbeat", async () => {
    await sendDays("device-10");

    const health = await getJson<HealthRow[]>(server, clientToken, "/v1/devices/device-10/health");

    expect(health).toEqual([
      expect.objectContaining({
        last_seen: instant,
        seq_gaps: 0,
        boot_id: "0123456789abcdef",
        uptime_seconds: 60,
        buffer_depth: 8,
      }),
    ]);
  });

  it("answers health with nulls before a first batch", async () => {
    await registerDevice(server, "device-new");

    const health = await getJson<HealthRow[]>(server, clientToken, "/v1/devices/device-new/health");

    expect(health).toEqual([expect.objectContaining({ last_seen: null, seq: null, seq_gaps: 0 })]);
  });

  it.each([
    "/v1/devices/nobody/metrics",
    "/v1/devices/nobody/latest",
    "/v1/devices/nobody/health",
    "/v1/devices/nobody/sources/source_1/metrics/power/series?from=0&to=1",
  ])("answers 404 for a device never registered: %s", async (path) => {
    const response = await read(server, clientToken, path);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      status: 404,
      title: "No such device",
    });
  });
});

describe("series", () => {
  it("takes a daily counter's deltas, none across the reset, and totals each day", async () => {
    await sendDays("device-03");

    const series = await getJson<Series>(
      server,
      clientToken,
      seriesPath("device-03", "source_1", "energy_today"),
    );
    const step = energyStep / 100;

    expect(series.declared).toBe(true);
    expect(series.data).toEqual({
      kind: "counter",
      intervals: [0, 1, 2, 4, 5, 6].map((index) => ({
        start: firstTs + index * periodMs,
        end: firstTs + (index + 1) * periodMs,
        delta: step,
      })),
      segments: [
        { end: firstTs + 3 * periodMs, total: 4 * step },
        { end: firstTs + 7 * periodMs, total: 4 * step },
      ],
    });
  });

  it("holds a state's code over the readings it spans", async () => {
    await sendDays("device-04");

    const series = await getJson<Series>(
      server,
      clientToken,
      seriesPath("device-04", "source_1", "mode"),
    );

    expect(series.data).toEqual({
      kind: "state",
      runs: [{ start: firstTs, end: firstTs + 7 * periodMs, code: 1 }],
    });
  });

  it("scales each reading by the manifest it was read under", async () => {
    const token = await registerDevice(server, "device-05");
    const boots = [
      { manifest: withPower(-1), bootId: "00000000000000a1", value: 2150 },
      { manifest: withPower(-2), bootId: "00000000000000a2", value: 21_500 },
    ];
    for (const [index, boot] of boots.entries()) {
      const device = bootDevice(server, { deviceId: "device-05", token, ...boot });
      await device.declare();
      device.poll("source_1", firstTs + index * periodMs, { power: boot.value });
      await device.flush(1);
    }

    const series = await getJson<Series>(
      server,
      clientToken,
      seriesPath("device-05", "source_1", "power"),
    );

    expect(series.data).toEqual({
      kind: "gauge",
      points: [
        { ts: firstTs, value: 215 },
        { ts: firstTs + periodMs, value: 215 },
      ],
    });
  });

  it("charts a metric the current manifest dropped, and says so", async () => {
    const token = await registerDevice(server, "device-06");
    const first = bootDevice(server, {
      deviceId: "device-06",
      token,
      manifest: withPower(0, [{ key: "voltage", kind: "gauge", unit: "V", exponent: 0 }]),
      bootId: "00000000000000b1",
    });
    await first.declare();
    first.poll("source_1", firstTs, { power: 1, voltage: 230 });
    await first.flush(1);
    await bootDevice(server, {
      deviceId: "device-06",
      token,
      manifest: withPower(0),
      bootId: "00000000000000b2",
    }).declare();

    const series = await getJson<Series>(
      server,
      clientToken,
      seriesPath("device-06", "source_1", "voltage"),
    );

    expect(series.declared).toBe(false);
    expect(series.data).toEqual({ kind: "gauge", points: [{ ts: firstTs, value: 230 }] });
  });

  it("answers 404 for a metric no manifest declared", async () => {
    await sendDays("device-07");

    expect(
      (await read(server, clientToken, seriesPath("device-07", "source_1", "voltage"))).status,
    ).toBe(404);
  });

  it("reads the last day when the window is left out", async () => {
    await sendDays("device-12");
    const response = await read(
      server,
      clientToken,
      "/v1/devices/device-12/sources/source_1/metrics/power/series",
    );

    expect(response.status).toBe(200);
  });

  it("refuses a window with one bound", async () => {
    const response = await read(
      server,
      clientToken,
      seriesPath("nobody", "source_1", "power", `from=${firstTs}`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: expect.stringContaining("together") });
  });

  it("refuses a range that ends before it starts", async () => {
    const path = seriesPath("device-07", "source_1", "power", `from=${lastTs}&to=${firstTs}`);
    const response = await read(server, clientToken, path);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: expect.stringContaining("to is after") });
  });
});

describe("auth", () => {
  it("answers 401 to a read with no token, before validating anything", async () => {
    const response = await read(server, undefined, "/v1/devices/Not%20An%20Id/health");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });

  it("refuses a device token: a device never reads", async () => {
    const deviceToken = await registerDevice(server, "device-reader");

    expect((await read(server, deviceToken, "/v1/devices")).status).toBe(401);
  });

  it("refuses a revoked client token", async () => {
    const revoked = await registerClient(server, "revoked");
    await revokeClient(server, "revoked");

    expect((await read(server, revoked, "/v1/devices")).status).toBe(401);
  });
});

it("answers a route it does not serve as a problem", async () => {
  const response = await read(server, clientToken, "/api/devices");

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toBe("application/problem+json");
});
