import type {
  Card,
  DeviceDetail,
  DeviceSummary,
  Layout,
  Problem,
  Series,
} from "@magellan/query/api";
import { queryOptions } from "@tanstack/react-query";

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

async function problemOf(response: Response): Promise<Problem> {
  if (response.headers.get("content-type")?.startsWith("application/problem+json") === true) {
    // The server writes problem bodies from the same type; the cast is that claim.
    return (await response.json()) as Problem;
  }
  return { type: "about:blank", status: response.status, title: response.statusText };
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api/v1${path}`, init);
  if (!response.ok) throw new ApiError(await problemOf(response));
  return response;
}

// The routes hold their bodies to these types with `satisfies`; the cast is that claim.
async function getJson<Body>(path: string): Promise<Body> {
  return (await (await send(path)).json()) as Body;
}

const segment = encodeURIComponent;

export const devicesQuery = () =>
  queryOptions({
    queryKey: ["devices"],
    queryFn: () => getJson<DeviceSummary[]>("/devices"),
    refetchInterval: refetchIntervalMs,
  });

export const deviceQuery = (deviceId: string) =>
  queryOptions({
    queryKey: ["devices", deviceId],
    queryFn: () => getJson<DeviceDetail>(`/devices/${segment(deviceId)}`),
    refetchInterval: refetchIntervalMs,
  });

export const layoutsQuery = (deviceId: string) =>
  queryOptions({
    queryKey: ["devices", deviceId, "layouts"],
    queryFn: () => getJson<Layout[]>(`/devices/${segment(deviceId)}/layouts`),
  });

export const seriesQuery = (deviceId: string, card: Pick<Card, "source" | "metric">) =>
  queryOptions({
    queryKey: ["devices", deviceId, "series", card.source, card.metric],
    queryFn: () =>
      getJson<Series>(
        `/devices/${segment(deviceId)}/sources/${segment(card.source)}/metrics/${segment(card.metric)}/series`,
      ),
    refetchInterval: refetchIntervalMs,
  });

export async function saveLayout(deviceId: string, name: string, cards: Card[]): Promise<void> {
  await send(`/devices/${segment(deviceId)}/layouts/${segment(name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cards }),
  });
}

export async function deleteLayout(deviceId: string, name: string): Promise<void> {
  await send(`/devices/${segment(deviceId)}/layouts/${segment(name)}`, { method: "DELETE" });
}
