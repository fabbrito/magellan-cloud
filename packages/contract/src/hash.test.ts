import { describe, expect, it } from "vitest";

import { manifestHash } from "./hash.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

// Digests computed with `sha256sum`, not by this implementation, so the test is an oracle and not a
// restatement. The second is the byte string the device would send for a one-source manifest.
const manifestJson =
  '{"sources":[{"id":"source_1","metrics":[{"key":"power_w","kind":"gauge","unit":"W","exponent":-2}]}]}';

describe("manifestHash", () => {
  it("hashes empty bytes", async () => {
    expect(await manifestHash(bytes(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes the manifest bytes as sent", async () => {
    expect(await manifestHash(bytes(manifestJson))).toBe(
      "d935aec39b4c492681d137f322ce5876ce1509289a3d5d759cd0b85fbf11790a",
    );
  });
});
