import type { DeviceDetail, Layout, Problem } from "@magellan/query/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppRouter } from "./router.tsx";

const device: DeviceDetail = {
  id: "local",
  description: "inverter",
  manifest: {
    hash: "a".repeat(64),
    declared_at: 1,
    body: {
      sources: [{ id: "inverter", metrics: [{ key: "power", kind: "gauge", exponent: 0 }] }],
    },
  },
  heartbeat: null,
  seq_gaps: 0,
};

const noDevice: Problem = { type: "about:blank", status: 404, title: "No such device" };

const json = (body: unknown, status = 200, type = "application/json") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": type } });

// The API as the dashboard sees it: one known device, no layouts yet.
function api(path: string): Response {
  if (path === "/api/v1/devices/local") return json(device);
  if (path === "/api/v1/devices/local/layouts") return json([] satisfies Layout[]);
  if (path === "/api/v1/devices") return json([]);
  return json(noDevice, 404, "application/problem+json");
}

function open(path: string) {
  vi.stubGlobal("fetch", (input: string) => Promise.resolve(api(input)));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the dashboard's routes", () => {
  it("answers a page it has no route for with the not-found page", async () => {
    open("/nowhere");
    expect(await screen.findByText("Not found")).toBeDefined();
    expect(screen.getByRole("link", { name: "All devices" })).toBeDefined();
  });

  it("answers a device the API does not know with the same page", async () => {
    open("/devices/ghost");
    expect(await screen.findByText("Not found")).toBeDefined();
  });

  it("opens a device without layouts on an empty editor", async () => {
    open("/devices/local");
    expect(await screen.findByText("No cards yet")).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Layout name" })).toBeDefined();
    expect(screen.getByText("No heartbeat yet.")).toBeDefined();
  });
});
