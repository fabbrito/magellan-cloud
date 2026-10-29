import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { adminToken, call, startCloud } from "./harness.ts";

let server: TestHarness;

beforeAll(async () => {
  server = await startCloud("");
});

afterAll(async () => {
  await server.close();
});

// A deploy that shipped no hash lets no one in, not even a well-formed token.
it("fails closed without a hash", async () => {
  const { token } = await adminToken();

  expect((await call(server, token, "/v1/devices")).status).toBe(500);
});
