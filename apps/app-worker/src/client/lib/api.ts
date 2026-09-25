import type {
  Card,
  DeviceDetail,
  DeviceSummary,
  Layout,
  Problem,
  Series,
} from "@magellan/query/api";
import { QueryClient, queryOptions } from "@tanstack/react-query";

import type { MetricRef } from "~/client/lib/cards";

// A refusal the API answered, carried whole so a view can tell a 404 from the rest.
export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail === undefined ? problem.title : `${problem.title}: ${problem.detail}`);
    this.problem = problem;
  }
}

// Readings land every few minutes; a minute behind is current enough.
const refetchIntervalMs = 60 * 1000;

// The server writes every body from these same types; the cast is that claim.
async function bodyOf<Body>(response: Response): Promise<Body> {
  return (await response.json()) as Body;
}

async function problemOf(response: Response): Promise<Problem> {
  if (response.headers.get("content-type")?.startsWith("application/problem+json") === true) {
    return bodyOf<Problem>(response);
  }
  return { type: "about:blank", status: response.status, title: response.statusText };
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api/v1${path}`, init);
  if (!response.ok) throw new ApiError(await problemOf(response));
  return response;
}

async function getJson<Body>(path: string): Promise<Body> {
  return bodyOf<Body>(await send(path));
}

// A refusal is final; only a failure to answer earns another try.
function retries(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError) {
    if (error.problem.status < 500) return false;
  }
  return failureCount < 3;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: retries } } });
}

const pathPart = encodeURIComponent;
const devicePath = (deviceId: string) => `/devices/${pathPart(deviceId)}`;
const layoutPath = (deviceId: string, name: string) =>
  `${devicePath(deviceId)}/layouts/${pathPart(name)}`;

export const devicesQuery = () =>
  queryOptions({
    queryKey: ["devices"],
    queryFn: () => getJson<DeviceSummary[]>("/devices"),
    refetchInterval: refetchIntervalMs,
  });

export const deviceQuery = (deviceId: string) =>
  queryOptions({
    queryKey: ["devices", deviceId],
    queryFn: () => getJson<DeviceDetail>(devicePath(deviceId)),
    refetchInterval: refetchIntervalMs,
  });

export const layoutsQuery = (deviceId: string) =>
  queryOptions({
    queryKey: ["devices", deviceId, "layouts"],
    queryFn: () => getJson<Layout[]>(`${devicePath(deviceId)}/layouts`),
  });

export const seriesQuery = (deviceId: string, card: MetricRef) =>
  queryOptions({
    queryKey: ["devices", deviceId, "series", card.source, card.metric],
    queryFn: () =>
      getJson<Series>(
        `${devicePath(deviceId)}/sources/${pathPart(card.source)}/metrics/${pathPart(card.metric)}/series`,
      ),
    refetchInterval: refetchIntervalMs,
  });

export async function saveLayout(deviceId: string, name: string, cards: Card[]): Promise<void> {
  await send(layoutPath(deviceId, name), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cards }),
  });
}

export async function deleteLayout(deviceId: string, name: string): Promise<void> {
  await send(layoutPath(deviceId, name), { method: "DELETE" });
}
