import type { Heartbeat } from "@magellan/contract";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { archiveOf, postHeartbeat, query, registerDevice, startIngest } from "./harness.ts";

let server: TestHarness;

beforeAll(async () => {
  server = await startIngest();
});

afterAll(async () => {
  await server.close();
});

const heartbeat: Heartbeat = {
  boot_id: "0123456789abcdef",
  uptime_seconds: 3600,
  buffer_depth: 2,
  battery_percent: 88,
  sources_last_heard: { inlet: 1_767_225_600_000 },
};

// A heartbeat names no manifest, and a device sends one at start, before it declares.
it("stores a heartbeat from a device yet to declare", async () => {
  const token = await registerDevice(server, "device-01");

  const response = await postHeartbeat(server, "device-01", token, heartbeat);

  expect(response.status).toBe(204);
  expect(
    await query(
      server,
      "SELECT boot_id, buffer_depth, battery_percent, signal_percent, sources_last_heard FROM heartbeats WHERE device_id = ?",
      "device-01",
    ),
  ).toEqual([
    {
      boot_id: "0123456789abcdef",
      buffer_depth: 2,
      battery_percent: 88,
      signal_percent: null,
      sources_last_heard: '{"inlet":1767225600000}',
    },
  ]);
});

// Live state, not record: nothing to rebuild it from, by design.
it("archives no heartbeat", async () => {
  const token = await registerDevice(server, "device-02");

  await postHeartbeat(server, "device-02", token, heartbeat);

  expect(await archiveOf(server, "device-02/")).toEqual([]);
});

it("refuses a heartbeat that names a source off the key pattern", async () => {
  const token = await registerDevice(server, "device-03");
  const bad = { ...heartbeat, sources_last_heard: { ".hidden": 1 } };

  const response = await postHeartbeat(server, "device-03", token, bad);

  expect(response.status).toBe(400);
});
