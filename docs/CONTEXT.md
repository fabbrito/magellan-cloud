# Context

Domain vocabulary for Magellan Cloud. Terms here are the ones the code, tests, issues and commits
use — don't drift to synonyms.

Magellan collects readings from small devices and stores them on Cloudflare. A device describes what
it can read in a manifest; the cloud stores whatever is declared. The cloud is a generic collector —
it never learns a device-specific word.

## Producers

The cloud sees a device only as a token and a stream of manifests and batches. How a device reads
its sources is `magellan-device`'s vocabulary, not this one.

| Term          | Meaning                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| **Device**    | A physical agent that uploads readings: an ESP32, a Raspberry Pi, the simulator      |
| **Simulator** | A fake device that speaks the contract — the cloud is tested against it, not a board |

**Caution — "device" is never a browser or HTML concept here.** It is a physical producer.

**Caution — only the uploading agent is a Device.** Whatever it reads — an inverter behind a relay,
a board on the local network — is a **source** to the manifest, never a Device. The chain is
device-side arrangement (`magellan-device` ADR 10).

## Data

| Term                 | Meaning                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Source**           | A named thing a device polls, identified per device                                                              |
| **Metric**           | A named, typed quantity of a source: a `key`, a `kind`, and for measured kinds an `exponent` and optional `unit` |
| **Reading**          | One source poll: a timestamp plus that source's metric values                                                    |
| **Manifest**         | A device's description of its sources and metrics, versioned by hash                                             |
| **Batch**            | One upload: a `boot_id`, a `seq`, a manifest hash, ordered readings, a heartbeat                                 |
| **Sequence** (`seq`) | A counter, monotonic within one boot; diagnostic, not what the cloud deduplicates on                             |
| **Boot id**          | Drawn once per boot, needing no flash; with `seq` it names a batch                                               |
| **Heartbeat**        | The device's account of itself — uptime, buffer depth, battery, signal, firmware                                 |
| **Exponent**         | A metric's decimal scale: its values mean `value × 10^exponent`                                                  |
| **Measured**         | When the device read the values — the reading's timestamp                                                        |
| **Received**         | When the cloud committed the batch. Routinely later than **measured**                                            |

**Metric `kind`** is one of `gauge`, `counter`, `state`. A gauge is a value in time, a counter is
monotonic between resets, a state is a discrete condition. The kind decides which rollups mean
anything.

**Reset** — a counter's value decreasing. Any decrease is one, declared or not: a counter restarting
at midnight, on reboot or on wrap reads the same. **`resets`** is a counter's declared cadence
(`daily`), never its boundary.

**Zone** — the device's IANA time zone, the manifest's `tz`. A calendar day is cut in it; timestamps
stay UTC.

**Caution — a "value" is the integer on the wire, never the physical quantity.** The quantity is a
value and its metric's exponent together; naming the value alone makes a reading look like a
measurement in units.

**Caution — "batch" and "reading" are different sizes.** A batch carries many readings and is the
unit of delivery and retry. A reading is the unit of storage, query and dedup. Saying "batch" when
you mean one poll makes a duplicate look like a whole upload rather than one colliding row.

**Caution — "metric" is not an observability metric.** It is a quantity a source reports, not CPU
time or request latency. Those are logs and live elsewhere.

## Cloud

| Term              | Meaning                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| **Ingest worker** | Device-facing. Verifies the token, validates, stores, commits, archives      |
| **API worker**    | Client-facing read API. Devices, health, series                              |
| **Jobs worker**   | Cron. Rollups, D1 retention, silent-device detection                         |
| **Registry**      | D1's declaration of what exists: devices, manifests, metrics                 |
| **Rollup**        | Many readings collapsed into one row per bucket per metric                   |
| **Bucket**        | The window a rollup covers — an hour or a day                                |
| **Archive**       | R2: every raw batch and every manifest, unchanged. D1 can be rebuilt from it |
| **Site**          | A cloud-side registry grouping above plant, holding a place                  |
| **Plant**         | A cloud-side registry grouping between site and device, holding a facility   |
| **Device token**  | One revocable credential per device; the cloud stores only its hash          |
| **Silent device** | A device whose last heartbeat is older than its expected cadence             |
| **Client**        | What reads the read API — a Grafana, a script. Owns presentation             |
| **Client token**  | One revocable read credential per client; never a device token               |
| **Token**         | A device token or a client token; its **kind** says which                    |

**Caution — a Cloudflare API token is never a Token here.** It is the maintainer's credential to the
account, and no code in the workers or packages ever holds one.

**Caution — a client is not a tenant.** Many clients read one deployment's devices; none owns them.
Presentation is the client's, never stored here.

**Caution — "source" and "manifest" are versioned differently.** A source has a stable `id` within a
device; the manifest that describes it changes. A batch names the manifest hash it was read under,
so a reading's shape is always traceable to a pinned declaration.

## Contract

| Term                 | Meaning                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **Contract**         | The ingest protocol (Layer 4) — the only interface between the repositories                             |
| **Contract version** | A tag in this repo (`contract-vX.Y.Z`) naming the published wire document `magellan-device` transcribes |
| **Manifest hash**    | SHA-256 over a manifest's bytes as sent — the manifest's identity and its tag                           |

## Vocabulary limits

Terms outside these bounds have no meaning in this repository; if one is needed, the boundary has
leaked.

- **No device-specific words.** `inverter`, `modbus`, `register`, `panel`, `string` belong to
  `magellan-device`. The cloud knows `source`, `metric`, `reading`, `manifest` and nothing finer.
- **No device commands.** The contract runs device → cloud. Control, configuration and OTA have no
  vocabulary here.
- **No device-side mechanism.** `driver`, `runtime`, `platform` name how a device reads; the cloud
  never sees them.
- **No time-series vocabulary.** There is no retention policy, downsampling rule or continuous query
  — there are rollups and a retention window, and nothing else.
- **No tenancy.** One deployment, one set of devices. `tenant` has no meaning yet. `site` and
  `plant` group devices inside that one deployment, cloud-side only.
