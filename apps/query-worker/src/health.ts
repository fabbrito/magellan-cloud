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
    for (let index = 1; index < seqs.length; index += 1) {
      const previous = seqs[index - 1];
      const current = seqs[index];
      if (previous === undefined || current === undefined) throw new Error("index past seqs");
      missing += current - previous - 1n;
    }
  }
  return Number(missing);
}
