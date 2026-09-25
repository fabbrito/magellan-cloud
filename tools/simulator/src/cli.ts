import type { Manifest } from "@magellan/contract";

import { ceilingReadings, gaugeManifest, largestManifest } from "./ceiling.ts";
import { SimulatedDevice, type CloudFetch } from "./index.ts";

// Drives the simulated device over a real socket, which is the one thing the suite cannot do: its
// tests reach workerd in process. It walks a boot — declare, poll, flush — against the same routes
// a device does. `ceiling` sends the largest manifest and the largest batch the contract allows.
//
// It is a probe, not a test. Nothing asserts here; the statuses it prints are the answer.
const sweepsDefault = 3;
const sweepsMax = 1000;

function refuse(problem: string): never {
  console.error(
    `${problem}\n\nusage: bun run sim <endpoint> <device-id> <token> [sweeps | ceiling]`,
  );
  process.exit(1);
}

type Run = { kind: "ceiling" } | { kind: "sweeps"; sweeps: number };

const sweepsRefusal = `Sweeps is 1 to ${sweepsMax}, or ceiling.`;

function parseRun(argument: string): Run {
  if (argument === "ceiling") return { kind: "ceiling" };
  if (!/^\d{1,4}$/.test(argument)) refuse(sweepsRefusal);
  const sweeps = Number(argument);
  if (sweeps < 1) refuse(sweepsRefusal);
  if (sweeps > sweepsMax) refuse(sweepsRefusal);
  return { kind: "sweeps", sweeps };
}

const [endpoint, deviceId, token, runArgument = String(sweepsDefault)] = process.argv.slice(2);
if (endpoint === undefined || !endpoint.startsWith("http")) refuse("An endpoint is an http URL.");
if (deviceId === undefined) refuse("A device id is required.");
if (token === undefined) refuse("A token is required.");
const run = parseRun(runArgument);

// The endpoint already carries /v1, as the device's config does, so the path the device builds is
// appended to it rather than replacing it (docs/DESIGN.md §6).
const base = endpoint.replace(/\/v1\/?$/, "");

const fetchCloud: CloudFetch = async (path, init) => {
  const response = await fetch(`${base}${path}`, init);
  console.log(`${init.method} ${path} -> ${response.status}`);
  return response;
};

const simulatedDevice = (manifest: Manifest, bootId: string) =>
  new SimulatedDevice({ deviceId, token, manifest, bootId, fetch: fetchCloud });

if (run.kind === "ceiling") {
  console.log(`declared ${await simulatedDevice(largestManifest, "c0ffee0000000000").declare()}`);

  const device = simulatedDevice(gaugeManifest, "c0ffee0000000001");
  console.log(`declared ${await device.declare()}`);
  for (const reading of ceilingReadings(Date.now())) {
    device.poll(reading.source, reading.ts, reading.values);
  }
  console.log(`ceiling: ${await device.flush(0)}`);
} else {
  // One source, one gauge: the probe exercises the wire, not the data.
  const device = simulatedDevice(
    {
      tz: "UTC",
      sources: [
        { id: "inlet", metrics: [{ key: "temperature", kind: "gauge", unit: "C", exponent: -1 }] },
      ],
    },
    "0123456789abcdef",
  );
  console.log(`declared ${await device.declare()}`);

  for (let sweep = 0; sweep < run.sweeps; sweep += 1) {
    device.poll("inlet", Date.now(), { temperature: 200 + sweep });
    const outcome = await device.flush(sweep);
    console.log(`sweep ${sweep}: ${outcome}, buffer ${device.bufferDepth}`);
  }
}
