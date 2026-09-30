import { pairs } from "./pairs.ts";

// Batches missing between the first and last seq each boot sent: dropped by a full buffer, or
// lost. A gap is recoverable from nothing, so it is shown rather than smoothed over
// (docs/DESIGN.md §8). A boot's batches before the window are outside it, not missing.
export interface Receipt {
  bootId: string;
  seq: string;
}

export function seqGaps(receipts: Receipt[]): number {
  const boots = new Map<string, bigint[]>();
  for (const receipt of receipts) {
    const seqs = boots.get(receipt.bootId) ?? [];
    seqs.push(BigInt(receipt.seq));
    boots.set(receipt.bootId, seqs);
  }

  let missing = 0n;
  for (const seqs of boots.values()) {
    seqs.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    for (const [previous, current] of pairs(seqs)) missing += current - previous - 1n;
  }
  return Number(missing);
}

// A device is heard by either route: a heartbeat on its cadence, a batch whenever it has readings.
// Each names its boot, so the later one's is current.
export interface Arrival {
  bootId: string;
  receivedAt: number;
}

export function latestArrival(heartbeat?: Arrival, receipt?: Arrival): Arrival | undefined {
  if (heartbeat === undefined) return receipt;
  if (receipt === undefined) return heartbeat;
  return receipt.receivedAt > heartbeat.receivedAt ? receipt : heartbeat;
}
