# 7. The heartbeat is apart from data

- Status: accepted

## Chosen

The heartbeat is its own request on its own cadence — hourly, around the clock — never a field of a
batch. It carries the device's account of itself: its boot, uptime, buffer depth, battery, signal,
firmware, and when it last heard each source down its chain. The device sends it unbuffered and
ignores the answer; the next one supersedes a lost one.

A batch keeps what identifies it — boot, sequence, manifest — and the cloud keeps that as its
receipt, which gap detection reads. The cloud has heard a device when either arrives.

Heartbeats go to D1 only. They are live state, not record, so R2 never holds them and D1 cannot
rebuild them.

## Why

Riding a batch tied liveness to the domain: a device with nothing to read — a source dark at night —
sent no batch, so it said nothing, and a silent device looked the same as an idle one. Apart, a
device is heard as long as it runs, and silence means one thing.

Last heard is kept per hop. The cloud knows when it last heard the device; only the device knows
when it last heard each source behind it. Both are needed to tell a dead link from a dead source.

A lost heartbeat costs one hour of resolution on a chart, never a reading, so it is not worth a
buffer, a retry or an archive.

## Cost

Two requests where there was one, and a second table on the write budget: about 24 rows a day a
device. The heartbeat history is the one D1 table nothing rebuilds. A device's health now joins two
tables, and "last heard" is the later of two arrivals.

## Reverses

A heartbeat that must survive a D1 loss is archived like a batch. A device whose sends are metered
tightly enough that a second request costs too much folds it back into the batch, and accepts that
an idle device goes silent.
