import { type Card, type Manifest, shownAs } from "@magellan/query/api";
import { PlusIcon } from "lucide-react";

import { Button } from "~/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/client/components/ui/select";
import type { MetricRef } from "~/client/lib/cards";

export interface Selection {
  pick?: MetricRef | undefined;
  as: Card["as"];
}

// Keys never hold `/` (the contract's key pattern), so it joins the two unambiguously.
const joined = (ref: MetricRef) => `${ref.source}/${ref.metric}`;

const shownAsLabels = { tile: "Tile", chart: "Chart" } satisfies Record<Card["as"], string>;

function optionsOf(manifest: Manifest) {
  return manifest.sources.flatMap((source) =>
    source.metrics.map((metric) => {
      const ref = { source: source.id, metric: metric.key };
      return { ref, value: joined(ref), label: `${metric.key} · ${source.id}` };
    }),
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
  const picked = selection.pick === undefined ? undefined : joined(selection.pick);
  const chosen = metrics.find((each) => each.value === picked);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={metrics}
        value={chosen?.value ?? null}
        onValueChange={(value) => {
          const next = metrics.find((each) => each.value === value);
          onSelect({ ...selection, pick: next?.ref });
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
        items={shownAsLabels}
        value={selection.as}
        onValueChange={(value) => {
          const as = shownAs.find((each) => each === value);
          if (as !== undefined) onSelect({ ...selection, as });
        }}
      >
        <SelectTrigger aria-label="Shown as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {shownAs.map((as) => (
            <SelectItem key={as} value={as}>
              {shownAsLabels[as]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={chosen === undefined}
        onClick={() => {
          if (chosen !== undefined) onAdd({ ...chosen.ref, as: selection.as });
        }}
      >
        <PlusIcon />
        Add card
      </Button>
    </div>
  );
}
