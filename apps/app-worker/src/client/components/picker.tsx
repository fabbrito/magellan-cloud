import type { Card, Manifest } from "@magellan/query/api";
import { PlusIcon } from "lucide-react";

import { Button } from "~/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/client/components/ui/select";

export interface Selection {
  source?: string | undefined;
  metric?: string | undefined;
  as?: Card["as"] | undefined;
}

// Keys never hold `/` (the contract's key pattern), so it joins the two unambiguously.
const joined = (source: string, metric: string) => `${source}/${metric}`;

const shapes = { tile: "Tile", chart: "Chart" } satisfies Record<Card["as"], string>;

function optionsOf(manifest: Manifest) {
  return manifest.sources.flatMap((source) =>
    source.metrics.map((metric) => ({
      value: joined(source.id, metric.key),
      label: `${metric.key} · ${source.id}`,
      source: source.id,
      metric: metric.key,
    })),
  );
}

// Chooses a metric the current manifest declares and how to show it. The selection lives in the
// URL, so a reload or a shared link keeps it.
export function Picker({
  manifest,
  selection,
  onSelect,
  onAdd,
}: {
  manifest: Manifest;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAdd: (card: Card) => void;
}) {
  const metrics = optionsOf(manifest);
  const chosen = metrics.find(
    (each) => each.source === selection.source && each.metric === selection.metric,
  );
  const as = selection.as ?? "tile";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={metrics}
        value={chosen?.value ?? null}
        onValueChange={(value) => {
          const next = metrics.find((each) => each.value === value);
          onSelect({ source: next?.source, metric: next?.metric, as });
        }}
      >
        <SelectTrigger className="min-w-56" aria-label="Metric">
          <SelectValue placeholder="Choose a metric" />
        </SelectTrigger>
        <SelectContent>
          {metrics.map((each) => (
            <SelectItem key={each.value} value={each.value}>
              {each.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={shapes}
        value={as}
        onValueChange={(value) => {
          if (value === "tile" || value === "chart") onSelect({ ...selection, as: value });
        }}
      >
        <SelectTrigger aria-label="Shown as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tile">{shapes.tile}</SelectItem>
          <SelectItem value="chart">{shapes.chart}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        disabled={chosen === undefined}
        onClick={() => {
          if (chosen !== undefined) onAdd({ source: chosen.source, metric: chosen.metric, as });
        }}
      >
        <PlusIcon />
        Add card
      </Button>
    </div>
  );
}
