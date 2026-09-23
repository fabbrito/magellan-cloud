import { expect, it } from "vitest";

import { etagHash } from "./etag.ts";

it("reads the hash however it is quoted", () => {
  for (const etag of ['"abc123"', "abc123", 'W/"abc123"', '  "abc123"  ']) {
    expect(etagHash(etag)).toBe("abc123");
  }
});

it("keeps whatever sits inside the quotes", () => {
  expect(etagHash('"abc123-gzip"')).toBe("abc123-gzip");
  expect(etagHash('"abc"123"')).toBe('abc"123');
});
