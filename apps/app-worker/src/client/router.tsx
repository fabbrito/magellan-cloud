import type { QueryClient, QueryExecuteOptions } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  notFound,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router";
import { z } from "zod";

import { NotFound } from "~/client/components/not-found";
import { Alert, AlertDescription } from "~/client/components/ui/alert";
import { ApiError, deviceQuery, devicesQuery, layoutsQuery } from "~/client/lib/api";
import { DevicePage } from "~/client/routes/device";
import { DevicesPage } from "~/client/routes/devices";

interface Context {
  queryClient: QueryClient;
}

// Before a page renders, its queries are in the cache: cached data as is, else fetched. The page's
// own observers refetch from there.
function warm<Data>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<Data, Error, Data, Data, string[]>,
) {
  return queryClient.query({ ...options, staleTime: "static" });
}

const rootRoute = createRootRouteWithContext<Context>()({
  component: () => (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 p-4 md:p-8">
      <nav>
        <Link to="/" className="font-semibold">
          Magellan
        </Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  ),
});

const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context }) => warm(context.queryClient, devicesQuery()),
  component: DevicesPage,
});

// Unparsed search is dropped, not refused: a stale link still opens the device.
const deviceSearchSchema = z.object({
  layout: z.string().optional().catch(undefined),
  source: z.string().optional().catch(undefined),
  metric: z.string().optional().catch(undefined),
  as: z.enum(["tile", "chart"]).optional().catch(undefined),
});

const deviceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devices/$id",
  validateSearch: deviceSearchSchema,
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        warm(context.queryClient, deviceQuery(params.id)),
        warm(context.queryClient, layoutsQuery(params.id)),
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.problem.status === 404) throw notFound();
      throw error;
    }
  },
  component: function DeviceRoute() {
    const { id } = deviceRoute.useParams();
    const search = deviceRoute.useSearch();
    const navigate = deviceRoute.useNavigate();
    return (
      <DevicePage
        deviceId={id}
        search={search}
        onSearch={(next) => void navigate({ search: next, replace: true })}
      />
    );
  },
});

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree: rootRoute.addChildren([devicesRoute, deviceRoute]),
    context: { queryClient },
    history,
    // The query cache owns freshness; the router re-runs loaders only to warm it.
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: ({ error }) => (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof Error ? error.message : String(error)}
        </AlertDescription>
      </Alert>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
