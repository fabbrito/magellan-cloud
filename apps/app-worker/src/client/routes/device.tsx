import type { Card, DeviceDetail, Layout } from "@magellan/query/api";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { InfoStrip } from "~/client/components/info-strip";
import { MetricCard } from "~/client/components/metric-card";
import { Picker, type Selection } from "~/client/components/picker";
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
import { addCard, moveCard, removeCard } from "~/client/lib/cards";

export interface DeviceSearch extends Selection {
  layout?: string | undefined;
}

interface Draft {
  name: string;
  cards: Card[];
  // A new name PUTs a new layout; an existing one's name is fixed while editing.
  isNew: boolean;
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
  // No layout yet: the page opens on an empty editor rather than an empty page.
  const editing =
    draft ?? (current === undefined ? { name: "main", cards: [], isNew: true } : null);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{device.id}</h1>
        <p className="text-muted-foreground">{device.description}</p>
      </header>
      <InfoStrip device={device} />
      {editing === null && current !== undefined ? (
        <LayoutView
          deviceId={deviceId}
          layouts={layouts}
          current={current}
          onChoose={(name) => onSearch({ ...search, layout: name })}
          onEdit={() => setDraft({ name: current.name, cards: current.cards, isNew: false })}
          onNew={() => setDraft({ name: "", cards: [], isNew: true })}
          onDeleted={() => onSearch({ ...search, layout: undefined })}
        />
      ) : (
        editing !== null && (
          <Editor
            device={device}
            draft={editing}
            search={search}
            onSearch={onSearch}
            onChange={setDraft}
            onDone={(name) => {
              setDraft(null);
              if (name !== undefined) onSearch({ ...search, layout: name });
            }}
            cancellable={current !== undefined}
          />
        )
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
      await queryClient.invalidateQueries({ queryKey: layoutsQuery(deviceId).queryKey });
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
      {remove.isError && <Problem error={remove.error} />}
      <Grid>
        {current.cards.map((card) => (
          <MetricCard
            key={`${card.source}/${card.metric}/${card.as}`}
            deviceId={deviceId}
            card={card}
          />
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
      await queryClient.invalidateQueries({ queryKey: layoutsQuery(device.id).queryKey });
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
        <Button
          disabled={save.isPending || draft.name === "" || draft.cards.length === 0}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
        {props.cancellable && (
          <Button variant="ghost" onClick={() => props.onDone()}>
            Cancel
          </Button>
        )}
      </div>
      {save.isError && <Problem error={save.error} />}
      {device.manifest === null ? (
        <p className="text-sm text-muted-foreground">
          No manifest yet: cards come from the metrics a device declares.
        </p>
      ) : (
        <Picker
          manifest={device.manifest.body}
          selection={props.search}
          onSelect={(selection) => props.onSearch({ ...props.search, ...selection })}
          onAdd={(card) => setCards(addCard(draft.cards, card))}
        />
      )}
      <DraftCards deviceId={device.id} cards={draft.cards} onChange={setCards} />
    </section>
  );
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
          key={`${card.source}/${card.metric}/${card.as}`}
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

function Problem({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}
