import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { bucketRowOf, declarationOf, sampleValuesOf } from "./read.ts";

describe("declarationOf", () => {
  it("parses the manifest a row stored", () => {
    const manifest = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state" }] }],
    };
    const body = JSON.stringify(manifest);

    expect(declarationOf({ hash: "abc", declaredAt: 1, body })).toEqual({
      hash: "abc",
      declaredAt: 1,
      manifest,
    });
  });

  it("throws on a stored body the contract does not accept", () => {
    expect(() => declarationOf({ hash: "abc", declaredAt: 1, body: "{}" })).toThrow(ZodError);
  });
});

describe("sampleValuesOf", () => {
  it("reads a metric the reading left out as null", () => {
    expect(sampleValuesOf("[213,null]", 2)).toEqual([213, null]);
  });

  it.each([
    ["not an array", "{}", 1, "a malformed values array"],
    ["one value short", "[1]", 2, "a malformed values array"],
    ["a value not a number", '["1"]', 1, "a value neither a number nor null"],
  ])("throws on %s", (_name, json, count, message) => {
    expect(() => sampleValuesOf(json, count)).toThrow(message);
  });
});

describe("bucketRowOf", () => {
  const row = {
    start: 0,
    manifest_hash: "abc",
    key_index: 1,
    total: 10,
    count: 2,
    last_ts: 5,
    last: 6,
  };

  it("names a bucket row's columns", () => {
    expect(bucketRowOf(row)).toEqual({
      start: 0,
      manifestHash: "abc",
      keyIndex: 1,
      total: 10,
      count: 2,
      lastTs: 5,
      last: 6,
    });
  });

  it("throws on a column of the wrong type", () => {
    expect(() => bucketRowOf({ ...row, manifest_hash: 1 })).toThrow("manifest_hash");
    expect(() => bucketRowOf({ ...row, last: null })).toThrow("last");
  });

  it("throws on a row that is not an object", () => {
    expect(() => bucketRowOf(null)).toThrow("not an object");
  });
});
