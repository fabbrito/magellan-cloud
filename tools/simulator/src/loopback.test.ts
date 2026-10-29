import { expect, it } from "vitest";

import { isLoopback } from "./loopback.ts";

it.each([
  "http://127.0.0.1:8787/v1",
  "http://localhost:8787",
  "http://LOCALHOST:8787",
  "http://[::1]:8787/v1",
  "http://127.1.2.3",
])("takes %o, a cloud on this machine", (endpoint) => {
  expect(isLoopback(endpoint)).toBe(true);
});

it.each([
  "https://magellan-ingest.example.workers.dev/v1",
  "http://127.0.0.1@example.com",
  "http://127.0.0.1.example.com",
  "http://localhost.example.com",
  "http://192.168.1.10:8787",
  "http://0.0.0.0:8787",
  "ftp://127.0.0.1",
  "127.0.0.1:8787",
  "",
])("refuses %o", (endpoint) => {
  expect(isLoopback(endpoint)).toBe(false);
});
