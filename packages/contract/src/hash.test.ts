import { describe, expect, it } from "vitest";

import { manifestHash } from "./hash.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

// Digests computed with `sha256sum`, not by this implementation, so the test is an oracle and not a
// restatement. The second is the byte string the device would send for a one-source manifest.
const manifestJson =
  '{"sources":[{"id":"source_1","metrics":[{"key":"power_w","kind":"gauge","unit":"W"}]}]}';

describe("manifestHash", () => {
  it("hashes empty bytes", async () => {
    expect(await manifestHash(bytes(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes the manifest bytes as sent", async () => {
    expect(await manifestHash(bytes(manifestJson))).toBe(
      "dc803b6bdf3e71bdc6633908d93792832731b960e5559a403e58c275e96fdaef",
    );
  });

  it("changes when the bytes change", async () => {
    expect(await manifestHash(bytes(manifestJson))).not.toBe(
      await manifestHash(bytes(`${manifestJson} `)),
    );
  });
});
