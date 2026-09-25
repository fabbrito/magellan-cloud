import type { Card as LayoutCard, Metric, Series } from "@magellan/query/api";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { CounterChart, GaugeChart, StateTimeline } from "~/client/components/charts";
import { Badge } from "~/client/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/client/components/ui/card";
import { Skeleton } from "~/client/components/ui/skeleton";
import { seriesQuery } from "~/client/lib/api";
import { latestOf, resetsDaily } from "~/client/lib/series";

function Chart({ series }: { series: Series }) {
  const { data, metric } = series;
  switch (data.kind) {
    case "gauge":
      return <GaugeChart metric={metric} points={data.points} />;
    case "counter":
      return <CounterChart metric={metric} intervals={data.intervals} segments={data.segments} />;
    case "state":
      return <StateTimeline metric={metric} runs={data.runs} />;
  }
}

function isEmpty(series: Series): boolean {
  const { data } = series;
  switch (data.kind) {
    case "gauge":
      return data.points.length === 0;
    case "counter":
      return data.segments.length === 0;
    case "state":
      return data.runs.length === 0;
  }
}

function Body({ card, series }: { card: LayoutCard; series: Series }) {
  if (isEmpty(series)) {
    return <p className="text-sm text-muted-foreground">No readings in range.</p>;
  }
  if (card.as === "chart") return <Chart series={series} />;
  return <p className="text-3xl font-semibold tabular-nums">{latestOf(series)}</p>;
}

// A daily counter's tile is today's total, not a running one.
function showsToday(card: LayoutCard, metric: Metric | undefined): boolean {
  if (card.as !== "tile") return false;
  if (metric === undefined) return false;
  return resetsDaily(metric);
}

export function MetricCard({
  deviceId,
  card,
  actions,
}: {
  deviceId: string;
  card: LayoutCard;
  actions?: ReactNode;
}) {
  const series = useQuery(seriesQuery(deviceId, card));
  return (
    <Card className={card.as === "chart" ? "md:col-span-2" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {card.metric}
          <span className="text-sm font-normal text-muted-foreground">{card.source}</span>
          {showsToday(card, series.data?.metric) && <Badge variant="secondary">today</Badge>}
          {series.data?.declared === false && <Badge variant="outline">no longer declared</Badge>}
        </CardTitle>
        {actions !== undefined && <CardAction className="flex gap-1">{actions}</CardAction>}
      </CardHeader>
      <CardContent>
        {series.isPending && <Skeleton className={card.as === "chart" ? "h-48" : "h-9 w-32"} />}
        {series.isError && <p className="text-sm text-destructive">{series.error.message}</p>}
        {series.isSuccess && <Body card={card} series={series.data} />}
      </CardContent>
    </Card>
  );
}
