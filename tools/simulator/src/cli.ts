import { SimulatedDevice, type CloudFetch } from "./index.ts";

// Drives the simulated device over a real socket, which is the one thing the suite cannot do: its
// tests reach workerd in process. Point it at `bun run dev` and it walks a boot — declare, poll,
// flush — against the same routes a device does.
//
// It is a probe, not a test. Nothing asserts here; the statuses it prints are the answer.
const sweepsDefault = 3;
const sweepsMax = 1000;

function refuse(problem: string): never {
  console.error(`${problem}\n\nusage: bun run sim <endpoint> <device-id> <token> [sweeps]`);
  process.exit(1);
}

const [endpoint, deviceId, token, sweeps = String(sweepsDefault)] = process.argv.slice(2);
if (endpoint === undefined || !endpoint.startsWith("http")) refuse("An endpoint is an http URL.");
if (deviceId === undefined) refuse("A device id is required.");
if (token === undefined) refuse("A token is required.");
if (!/^\d{1,4}$/.test(sweeps) || Number(sweeps) < 1 || Number(sweeps) > sweepsMax) {
  refuse(`Sweeps is 1 to ${sweepsMax}.`);
}

// The endpoint already carries /v1, as the device's config does, so the path the device builds is
// appended to it rather than replacing it (docs/DESIGN.md §6).
const base = endpoint.replace(/\/v1\/?$/, "");

const fetchCloud: CloudFetch = async (path, init) => {
  const response = await fetch(`${base}${path}`, init);
  console.log(`${init.method} ${path} -> ${response.status}`);
  return response;
};

const device = new SimulatedDevice({
  deviceId,
  token,
  // One source, one gauge: the probe exercises the wire, not the data.
  manifest: {
    sources: [
      { id: "inlet", metrics: [{ key: "temperature", kind: "gauge", unit: "C", exponent: -1 }] },
    ],
  },
  bootId: "0123456789abcdef",
  fetch: fetchCloud,
});

const hash = await device.declare();
console.log(`declared ${hash}`);

for (let sweep = 0; sweep < Number(sweeps); sweep += 1) {
  device.poll("inlet", Date.now(), { temperature: 200 + sweep });
  const outcome = await device.flush(sweep);
  console.log(`sweep ${sweep}: ${outcome}, buffer ${device.bufferDepth}`);
}
