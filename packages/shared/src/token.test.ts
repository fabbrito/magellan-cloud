import { describe, expect, it } from "vitest";

import { bearerToken, idPattern, mintToken, TOKEN, tokenPattern } from "./token.ts";

// mintToken builds the format and tokenPattern validates it. They are two separate statements of
// the same rule, so a drift between them is exactly what this catches.
describe("mintToken", () => {
  it("mints what tokenPattern accepts", () => {
    expect(mintToken()).toMatch(tokenPattern);
  });

  // base64url's alphabet is the point of the encoding: a token rides in an Authorization header and
  // a `+` or `/` would survive it, while `=` would not survive a URL.
  it.each(["+", "/", "="])("never emits %o", (character) => {
    expect(mintToken()).not.toContain(character);
  });

  it("carries all 32 bytes: 43 base64 characters, unpadded", () => {
    expect(mintToken()).toHaveLength(TOKEN.prefix.length + 43);
  });
});

describe("tokenPattern", () => {
  it("refuses a body with no prefix, so a bare digest is not a token", () => {
    expect(mintToken().slice(TOKEN.prefix.length)).not.toMatch(tokenPattern);
  });

  it("refuses standard base64, which a rewritten encoder would emit", () => {
    expect(`${TOKEN.prefix}${"+".repeat(43)}`).not.toMatch(tokenPattern);
  });

  it("refuses a short body, so a truncated token is not a prefix match", () => {
    expect(`${TOKEN.prefix}${"a".repeat(42)}`).not.toMatch(tokenPattern);
  });
});

// The id reaches a URL path and a SQL string literal, so the pattern is what keeps both safe.
describe("idPattern", () => {
  it("accepts a plain id", () => {
    expect("shop-floor-01").toMatch(idPattern);
  });

  it.each([
    ["shop'floor", "closes a SQL string literal"],
    ["shop floor", "needs escaping in a URL"],
    ["shop/floor", "adds a path segment"],
    ["shop%2f", "decodes to a path segment"],
    ["Shop-Floor", "differs from its lowercase twin only by case"],
    ["-leading", "reads as a flag on a command line"],
    ["", "names nothing"],
    ["a".repeat(TOKEN.idLengthMax + 1), "is past the column's bound"],
  ])("refuses %o, which %s", (id) => {
    expect(id).not.toMatch(idPattern);
  });
});

describe("bearerToken", () => {
  it("takes the token from a bearer header", () => {
    const token = mintToken();

    expect(bearerToken(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    [undefined, "is no header"],
    ["Basic dXNlcjpwYXNz", "is another scheme"],
    [`bearer ${"a".repeat(4)}`, "is no token"],
    [`Bearer ${TOKEN.prefix}${"a".repeat(42)}`, "is one character short"],
  ] as [string | undefined, string][])("refuses %o, which %s", (header) => {
    expect(bearerToken(header)).toBeUndefined();
  });
});
