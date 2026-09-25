import type { DeviceDetail } from "@magellan/query/api";
import type { ReactNode } from "react";

import { formatAge } from "~/client/lib/format";
import { useNow } from "~/client/lib/now";

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

// Always shown, layout or not: whether the device is alive and delivering.
export function InfoStrip({ device }: { device: DeviceDetail }) {
  const nowMs = useNow();
  const { heartbeat } = device;
  if (heartbeat === null) {
    return <p className="text-sm text-muted-foreground">No heartbeat yet.</p>;
  }
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl bg-muted/50 px-4 py-3 text-sm">
      <Item label="Last seen">{formatAge(heartbeat.received_at, nowMs)}</Item>
      <Item label="Buffered">{heartbeat.buffer_depth}</Item>
      <Item label="Signal">
        {heartbeat.signal_percent === null ? "—" : `${heartbeat.signal_percent}%`}
      </Item>
      {heartbeat.battery_percent !== null && (
        <Item label="Battery">{heartbeat.battery_percent}%</Item>
      )}
      <Item label="Firmware">{heartbeat.firmware_version ?? "—"}</Item>
      <Item label="Seq gaps, 24 h">{device.seq_gaps}</Item>
    </dl>
  );
}
