# Roadmap

Directions decided in outline and deferred until something needs them (`AGENTS.md` > Defer). None is
a commitment: each names the trigger that brings it in, and is re-decided against the code as it
stands then. Once built, an entry leaves here for `docs/DESIGN.md` or an ADR.

## A producer that is not a board

**Trigger:** a second kind of producer with no boot to speak of — a scheduled scraper, a serverless
job, a script backfilling history.

The contract was written against an embedded board, but only the batch and the heartbeat say so. The
manifest is already neutral: a zone, sources, typed metrics.

- **Batch** — no wire change. A producer without boots draws a fresh `boot_id` each run and starts
  `seq` at zero. That is valid v1 today, since a reading's own key deduplicates
  (`docs/adr/0003-dedup-is-the-readings-own-key.md`); such a producer gives up gap detection, which
  is diagnostic. The glossary then defines a boot as one run of the producer.
- **Heartbeat** — board vitals stop being heartbeat fields. Battery and signal become metrics of a
  source the device declares about itself, and gain a history the heartbeat never keeps
  (`docs/adr/0007-the-heartbeat-is-apart-from-data.md`). A minor version deprecates the fields,
  still accepted; a `/v2` drops them, beside whatever else breaks then. `firmware_version` stays:
  the producer's software version is not a board's.
- **No reserved source id.** The device names the source it declares about itself. A name the
  contract reserved would be a word the cloud knows, and the cloud knows none.

**Not the trigger:** host monitoring on a LAN. Always connected, polled every few seconds and
queried by rate and aggregate, it wants a Prometheus stack. This collector is for producers that go
offline, buffer, and fit a write budget.
