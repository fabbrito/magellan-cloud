# 3. Deduplication is the readings' own key

- Status: accepted

## Chosen

D1's readings table is keyed on `(device_id, source, ts)`. Ingest writes with `INSERT OR IGNORE`, so
a replayed batch collides row for row and vanishes. There is no receipts table.

The batch's `boot_id` and `seq` are kept, but diagnostic: they make a gap visible and the heartbeat
carries the pair as the batch's receipt. They never gate a commit.

## Why

A reading's own key is the same on every delivery of it, whichever boot sent it and however many
times. Absorbing a replay is then a collision, and the case a receipts table gets wrong works: two
boots that draw the same `boot_id` and restart at the same `seq` still land both their readings,
because the deliveries collide and the readings are distinct. Only a _delivery_ is lost, and a
delivery carries no reading.

A receipts table keyed on `(device_id, boot_id, seq)` was the alternative. It makes a batch the unit
of dedup, which the contract says a batch is not — a batch carries many readings, and a batch
dropped as a replay takes readings that were never stored with it. It also adds a write per batch
and rows to retain and expire, on the same D1 budget the readings are already spent against.

`seq` alone was never the key: it restarts every boot, so it identifies a batch only paired with
`boot_id`, which is exactly what a receipts table would have needed.

## Cost

Two readings that genuinely share a `(device_id, source, ts)` collide and the second is dropped. A
source polled faster than the timestamp's one-millisecond resolution loses readings, silently — the
row looks like a duplicate, not like a bug. Keeping the cadence above the resolution is the device's
to hold.

Dedup rests on the device's clock rather than on a delivery counter. A clock that steps backwards or
repeats a millisecond across a poll collides where the counter would not.

`INSERT OR IGNORE` reports nothing about which rows were ignored, so ingest cannot answer "was this
delivered" from the write; that answer is `boot_id`+`seq` gap detection, a health signal rather than
a per-request answer.

## Reverses

If a source can produce two distinct readings at one timestamp, the key grows the metric values —
the reading's identity becomes all of it — or the delivery counter becomes the key again in a
receipts table. Either reverses this without touching the wire.
