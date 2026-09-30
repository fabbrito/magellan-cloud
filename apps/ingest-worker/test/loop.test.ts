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

// What a cloud test may assert is what the cloud did: the rows it wrote, and whether the device was
// freed to move on. How a device classifies a status is the device's own reading of the contract,
// tested beside it in tools/simulator/src/outcome.test.ts (magellan-device ADR 2).
it("carries a boot from declaring to committed", async () => {
  const token = await registerDevice(server, "device-01");
  const device = boot("device-01", token);

  await device.declare();
  device.poll("inlet", 1_767_225_600_000, { temperature: 213 });
  await device.flush();

  expect(device.bufferDepth).toBe(0);
  expect(
    await query(server, "SELECT source FROM readings WHERE device_id = ?", "device-01"),
  ).toEqual([{ source: "inlet" }]);
});

it("keeps the buffer until the manifest it named exists", async () => {
  const token = await registerDevice(server, "device-02");
  const device = boot("device-02", token);
  device.poll("inlet", 1_767_225_600_000, { temperature: 100 });

  await device.flush();

  // Nothing committed and nothing lost: the batch named a manifest the cloud cannot resolve, which
  // is not the device's fault and so must not cost it the readings (docs/DESIGN.md §6).
  expect(device.bufferDepth).toBe(1);
  expect(await query(server, "SELECT ts FROM readings WHERE device_id = ?", "device-02")).toEqual(
    [],
  );

  await device.declare();
  await device.flush();

  expect(device.bufferDepth).toBe(0);
  expect(await query(server, "SELECT ts FROM readings WHERE device_id = ?", "device-02")).toEqual([
    { ts: 1_767_225_600_000 },
  ]);
});

it("drops a batch the cloud refuses for good", async () => {
  const token = await registerDevice(server, "device-03");
  const device = boot("device-03", token);
  await device.declare();
  device.poll("outlet", 1_767_225_600_000, { temperature: 1 });

  await device.flush();

  // The manifest declares no `outlet`, and retrying will not make it declare one. An emptied buffer
  // is what separates this from the unresolved manifest above: refused for good, not deferred.
  expect(device.bufferDepth).toBe(0);
  expect(await query(server, "SELECT ts FROM readings WHERE device_id = ?", "device-03")).toEqual(
    [],
  );
});
