import { type Card, type DeviceDetail, type Layout, shownAs } from "@magellan/query/api";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { InfoStrip } from "~/client/components/info-strip";
import { MetricCard } from "~/client/components/metric-card";
import { Picker } from "~/client/components/picker";
import { Alert, AlertDescription } from "~/client/components/ui/alert";
import { Button } from "~/client/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/client/components/ui/empty";
import { Input } from "~/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/client/components/ui/select";
import { deleteLayout, deviceQuery, layoutsQuery, saveLayout } from "~/client/lib/api";
import { addCard, cardKey, type MetricRef, moveCard, removeCard } from "~/client/lib/cards";

// Unparsed search is dropped, not refused: a stale link still opens the device.
export const deviceSearchSchema = z.object({
  layout: z.string().optional().catch(undefined),
  source: z.string().optional().catch(undefined),
  metric: z.string().optional().catch(undefined),
  as: z.enum(shownAs).optional().catch(undefined),
});

type DeviceSearch = z.infer<typeof deviceSearchSchema>;

function pickOf(search: DeviceSearch): MetricRef | undefined {
  if (search.source === undefined) return undefined;
  if (search.metric === undefined) return undefined;
  return { source: search.source, metric: search.metric };
}

interface Draft {
  name: string;
  cards: Card[];
  // A new name PUTs a new layout; an existing one's name is fixed while editing.
  isNew: boolean;
}

type View =
  | { kind: "layout"; layout: Layout }
  | { kind: "editor"; draft: Draft; cancellable: boolean };

// No layout yet: the page opens on an empty editor rather than an empty page.
function viewOf(draft: Draft | null, current: Layout | undefined): View {
  if (draft !== null) return { kind: "editor", draft, cancellable: current !== undefined };
  if (current === undefined) {
    return { kind: "editor", draft: { name: "main", cards: [], isNew: true }, cancellable: false };
  }
  return { kind: "layout", layout: current };
}

function invalidateLayouts(queryClient: QueryClient, deviceId: string) {
  return queryClient.invalidateQueries({ queryKey: layoutsQuery(deviceId).queryKey });
}

interface Props {
  deviceId: string;
  search: DeviceSearch;
  onSearch: (search: DeviceSearch) => void;
}

export function DevicePage({ deviceId, search, onSearch }: Props) {
  const device = useSuspenseQuery(deviceQuery(deviceId)).data;
  const layouts = useSuspenseQuery(layoutsQuery(deviceId)).data;
  const [draft, setDraft] = useState<Draft | null>(null);

  const current = layouts.find((layout) => layout.name === search.layout) ?? layouts[0];
  const view = viewOf(draft, current);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{device.id}</h1>
        <p className="text-muted-foreground">{device.description}</p>
      </header>
      <InfoStrip device={device} />
      {view.kind === "layout" ? (
        <LayoutView
          deviceId={deviceId}
          layouts={layouts}
          current={view.layout}
          onChoose={(name) => onSearch({ ...search, layout: name })}
          onEdit={() =>
            setDraft({ name: view.layout.name, cards: view.layout.cards, isNew: false })
          }
          onNew={() => setDraft({ name: "", cards: [], isNew: true })}
          onDeleted={() => onSearch({ ...search, layout: undefined })}
        />
      ) : (
        <Editor
          device={device}
          draft={view.draft}
          search={search}
          onSearch={onSearch}
          onChange={setDraft}
          onDone={(name) => {
            setDraft(null);
            if (name !== undefined) onSearch({ ...search, layout: name });
          }}
          cancellable={view.cancellable}
        />
      )}
    </div>
  );
}

function LayoutView(props: {
  deviceId: string;
  layouts: Layout[];
  current: Layout;
  onChoose: (name: string) => void;
  onEdit: () => void;
  onNew: () => void;
  onDeleted: () => void;
}) {
  const { deviceId, layouts, current } = props;
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteLayout(deviceId, current.name),
    onSuccess: async () => {
      await invalidateLayouts(queryClient, deviceId);
      props.onDeleted();
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={current.name}
          onValueChange={(name) => {
            if (name !== null) props.onChoose(name);
          }}
        >
          <SelectTrigger aria-label="Layout" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {layouts.map((layout) => (
              <SelectItem key={layout.name} value={layout.name}>
                {layout.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={props.onEdit}>
          Edit
        </Button>
        <Button variant="outline" onClick={props.onNew}>
          New layout
        </Button>
        <Button
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete layout ${current.name}?`)) remove.mutate();
          }}
        >
          Delete
        </Button>
      </div>
      {remove.isError && <ProblemAlert error={remove.error} />}
      <Grid>
        {current.cards.map((card) => (
          <MetricCard key={cardKey(card)} deviceId={deviceId} card={card} />
        ))}
      </Grid>
    </section>
  );
}

function Editor(props: {
  device: DeviceDetail;
  draft: Draft;
  search: DeviceSearch;
  onSearch: (search: DeviceSearch) => void;
  onChange: (draft: Draft) => void;
  onDone: (savedName?: string) => void;
  cancellable: boolean;
}) {
  const { device, draft } = props;
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => saveLayout(device.id, draft.name, draft.cards),
    onSuccess: async () => {
      await invalidateLayouts(queryClient, device.id);
      props.onDone(draft.name);
    },
  });
  const setCards = (cards: Card[]) => props.onChange({ ...draft, cards });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Layout name"
          placeholder="Layout name"
          className="w-48"
          value={draft.name}
          disabled={!draft.isNew}
          onChange={(event) => props.onChange({ ...draft, name: event.target.value })}
        />
        <Button disabled={save.isPending || !savable(draft)} onClick={() => save.mutate()}>
          Save
        </Button>
        {props.cancellable && (
          <Button variant="ghost" onClick={() => props.onDone()}>
            Cancel
          </Button>
        )}
      </div>
      {save.isError && <ProblemAlert error={save.error} />}
      {device.manifest === null ? (
        <p className="text-sm text-muted-foreground">
          No manifest yet: cards come from the metrics a device declares.
        </p>
      ) : (
        <Picker
          manifest={device.manifest.body}
          selection={{ pick: pickOf(props.search), as: props.search.as ?? "tile" }}
          onSelect={({ pick, as }) =>
            props.onSearch({ ...props.search, source: pick?.source, metric: pick?.metric, as })
          }
          onAdd={(card) => setCards(addCard(draft.cards, card))}
        />
      )}
      <DraftCards deviceId={device.id} cards={draft.cards} onChange={setCards} />
    </section>
  );
}

function savable(draft: Draft): boolean {
  if (draft.name === "") return false;
  return draft.cards.length > 0;
}

function DraftCards(props: { deviceId: string; cards: Card[]; onChange: (cards: Card[]) => void }) {
  const { deviceId, cards, onChange } = props;
  return cards.length === 0 ? (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No cards yet</EmptyTitle>
        <EmptyDescription>Choose a metric above and add it as a tile or a chart.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent />
    </Empty>
  ) : (
    <Grid>
      {cards.map((card, index) => (
        <MetricCard
          key={cardKey(card)}
          deviceId={deviceId}
          card={card}
          actions={
            <CardControls
              index={index}
              count={cards.length}
              onMove={(by) => onChange(moveCard(cards, index, by))}
              onRemove={() => onChange(removeCard(cards, index))}
            />
          }
        />
      ))}
    </Grid>
  );
}

function CardControls(props: {
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Move up"
        disabled={props.index === 0}
        onClick={() => props.onMove(-1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Move down"
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(1)}
      >
        <ArrowDownIcon />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={props.onRemove}>
        <XIcon />
      </Button>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function ProblemAlert({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}
