# Magellan Cloud

Cloud half of Magellan — collects readings from small devices and stores them on Cloudflare. The
device half is `magellan-device`; the two meet only at the contract.

- North star: `docs/DESIGN.md`
- Vocabulary: `docs/CONTEXT.md`
- Conventions: `AGENTS.md`
- Style: `docs/STYLE.md`

## Status

The ingest worker is live and takes a device's manifests and batches. The query worker answers
devices, series and layouts over the same D1; the dashboard and the jobs worker are still scaffold.

## Setup

```bash
bun install
```

`bun run` lists the scripts, so they are not copied here to rot.

Anything that authenticates to Cloudflare is the maintainer's to run, never an agent's
(`AGENTS.md`). The split is in the tool: `bun run` reaches the local store at most, `make` reaches
the account.

## Running it

```bash
bun run dev                        # local migrations, then ingest on :8787 and query on :8788
bun run dev:ingest                 # or one of them alone: dev:ingest, dev:query
bun run mint <id> <description>    # a token, and the statement that registers it
bun run dev:reset                  # drop the local store; the next dev rebuilds it
```

`dev` serves both workers in workerd against one local D1 and R2 under `.wrangler/state` at the
root, so the query worker reads what ingest commits. That store persists across restarts, registered
devices included, and `dev:reset` is the only thing that clears it. It is not the store the tests
use — they boot their own and throw it away, so a test run leaves it untouched.

### Against the device

`magellan-device` points at this worker through its `config.toml`:

```toml
[cloud]
endpoint = "http://127.0.0.1:8787/v1"
```

`MAGELLAN_DEVICE_ID` and `MAGELLAN_TOKEN` come from `bun run mint`, whose printed statement
registers the hash here. The device refuses plain http unless it is loopback, so one running on
another host wants a tunnel to this one rather than a LAN address.

## Deploying

The maintainer's. Copy `cloudflare.prod.env.example` to `cloudflare.prod.env` — git ignores it — and
fill it as the targets ask. Each target fetches a scoped API token from `CLOUDFLARE_TOKEN_CMD`, so
no `wrangler login` is left for anything else to use. `make` lists them:

```bash
make bootstrap                               # D1 and R2; the D1 id goes in cloudflare.prod.env
make migrate deploy                          # migrate first: a new ingest writes the new shape
make register ID=<id> DESCRIPTION='<text>'   # a device token, printed once
make probe                                   # or probe-ceiling, with `make tail` beside it
make sql SQL='<statement>'                   # the live D1; `$` in a JSON path reaches it intact
```

The query worker has no auth of its own: Cloudflare Access guards it, set on the worker itself —
Workers & Pages > `magellan-query` > Access > All traffic. Until that is on, its workers.dev URL is
public, so it is the step right after the first deploy.

## Layout

```
packages/contract/   the contract: Zod schemas, and openapi.json emitted from the routes
packages/db/         D1 schema and migrations
packages/shared/     token auth, errors, logging
apps/ingest-worker/  device-facing
apps/query-worker/   dashboard-facing, behind Cloudflare Access
apps/jobs-worker/    cron — rollups, retention, silent-device detection
apps/dashboard/      static SPA
tools/simulator/     a fake device that speaks the contract
tools/emit-openapi/  writes packages/contract/openapi.json from the worker's routes
tools/mint-token/    mints a device token and the statement that registers it
scripts/             the Makefile's shell, reaching the account
```

The workspaces exist; what goes in them lands incrementally. `docs/DESIGN.md` is the stack and the
boundaries.
