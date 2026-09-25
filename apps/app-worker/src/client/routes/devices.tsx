import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/client/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/client/components/ui/table";
import { devicesQuery } from "~/client/lib/api";
import { formatAge } from "~/client/lib/format";
import { useNow } from "~/client/lib/now";

export function DevicesPage() {
  const devices = useSuspenseQuery(devicesQuery()).data;
  const nowMs = useNow();

  if (devices.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No devices</EmptyTitle>
          <EmptyDescription>A device appears here once it is registered.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => (
          <TableRow key={device.id}>
            <TableCell className="font-medium">
              <Link to="/devices/$id" params={{ id: device.id }} className="hover:underline">
                {device.id}
              </Link>
            </TableCell>
            <TableCell>{device.description}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {device.last_seen === null ? "never" : formatAge(device.last_seen, nowMs)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
