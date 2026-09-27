import { manifestHash, type Batch, type Manifest, type Reading } from "@magellan/contract";

import { etagHash } from "./etag.ts";
import { classify, type Outcome } from "./outcome.ts";

// Only what an answer is read for. Structural, so a harness's `fetch` and a runtime's both fit
// without this naming either one's `Response`.
export interface CloudResponse {
  status: number;
  headers: { get(name: string): string | null };
}

export type CloudFetch = (
  path: string,
  init: { method: string; headers: Record<string, string>; body: Uint8Array },
) => Promise<CloudResponse>;

// A device as the cloud may assume one behaves: it declares its manifest, buffers readings, and
// sends them as one batch. It keeps no clock — uptime is stated at the call site — and it holds no
// network client, taking the `fetch` that reaches the cloud under test.
export interface DeviceOptions {
  deviceId: string;
  token: string;
  manifest: Manifest;
  // Drawn once per boot on a real device; stated here so a test can replay one.
  bootId: string;
  fetch: CloudFetch;
}

export class SimulatedDevice {
  private readonly options: DeviceOptions;
  private readonly bytes: Uint8Array;
  private readonly buffer: Reading[] = [];
  private seq = 0n;

  constructor(options: DeviceOptions) {
    this.options = options;
    // The bytes are what the hash is over, so they are serialized once and kept.
    this.bytes = new TextEncoder().encode(JSON.stringify(options.manifest));
  }

  get bufferDepth(): number {
    return this.buffer.length;
  }

  // Answers with the hash the cloud accepted, and refuses to go on if it is not this manifest's:
  // a device that trusts a hash it did not compute sends batches under one the cloud cannot
  // resolve.
  async declare(): Promise<string> {
    const response = await this.send("PUT", "manifest", this.bytes);
    const mine = await manifestHash(this.bytes);
    const accepted = etagHash(response.headers.get("etag") ?? "");

    if (response.status !== 200)
      throw new Error(`the cloud refused the manifest: ${response.status}`);
    if (accepted !== mine) throw new Error(`the cloud accepted ${accepted}, not ${mine}`);
    return accepted;
  }

  poll(source: string, ts: number, values: Record<string, number>): void {
    this.buffer.push({ source, ts, values });
  }

  // One batch, one delivery. The buffer survives anything the cloud may yet accept, and is dropped
  // only on an answer that will not change: committed, or refused for good.
  async flush(uptimeSeconds: number): Promise<Outcome> {
    const batch: Batch = {
      manifest_hash: await manifestHash(this.bytes),
      boot_id: this.options.bootId,
      seq: String(this.seq),
      readings: [...this.buffer],
      heartbeat: { uptime_seconds: uptimeSeconds, buffer_depth: this.buffer.length },
    };

    const body = new TextEncoder().encode(JSON.stringify(batch));
    const response = await this.send("POST", "batches", body);
    const outcome = classify(response.status);

    if (outcome === "committed" || outcome === "rejected") {
      this.buffer.length = 0;
      this.seq += 1n;
    }
    return outcome;
  }

  // The verb rides with the resource rather than being inferred from its name, and the length is
  // declared: the cloud answers 411 to a body whose size a device will not state.
  private send(
    method: "PUT" | "POST",
    resource: "manifest" | "batches",
    body: Uint8Array,
  ): Promise<CloudResponse> {
    return this.options.fetch(`/v1/devices/${this.options.deviceId}/${resource}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
        "content-length": String(body.byteLength),
      },
      body,
    });
  }
}
