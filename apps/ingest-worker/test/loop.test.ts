import { SimulatedDevice } from "@magellan/simulator";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { manifest } from "./fixtures.ts";
import { query, registerDevice, startIngest } from "./harness.ts";

let server: TestHarness;

beforeAll(async () => {
  server = await startIngest();
});

afterAll(async () => {
  await server.close();
});

function boot(deviceId: string, token: string): SimulatedDevice {
  return new SimulatedDevice({
    deviceId,
    token,
    manifest,
    bootId: "0123456789abcdef",
    fetch: (path, init) => server.fetch(path, init),
  });
}

it("carries a boot from declaring to committed", async () => {
  const token = await registerDevice(server, "inverter");
  const device = boot("inverter", token);

  await device.declare();
  device.poll("inlet", 1_767_225_600_000, { temperature: 213 });
  const outcome = await device.flush(42);

  expect(outcome).toBe("committed");
  expect(
    await query(server, "SELECT source FROM readings WHERE device_id = ?", "inverter"),
  ).toEqual([{ source: "inlet" }]);
});

it("keeps the buffer until the manifest it named exists", async () => {
  const token = await registerDevice(server, "generator");
  const device = boot("generator", token);
  device.poll("inlet", 1_767_225_600_000, { temperature: 100 });

  const beforeDeclaring = await device.flush(10);

  expect(beforeDeclaring).toBe("unavailable");
  expect(device.bufferDepth).toBe(1);

  await device.declare();
  const afterDeclaring = await device.flush(20);

  expect(afterDeclaring).toBe("committed");
  expect(device.bufferDepth).toBe(0);
  expect(await query(server, "SELECT ts FROM readings WHERE device_id = ?", "generator")).toEqual([
    { ts: 1_767_225_600_000 },
  ]);
});

it("drops a batch the cloud refuses for good", async () => {
  const token = await registerDevice(server, "alternator");
  const device = boot("alternator", token);
  await device.declare();
  device.poll("outlet", 1_767_225_600_000, { temperature: 1 });

  const outcome = await device.flush(30);

  // The manifest declares no `outlet`, and retrying will not make it declare one.
  expect(outcome).toBe("rejected");
  expect(device.bufferDepth).toBe(0);
});
