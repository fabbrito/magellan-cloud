# Magellan Cloud

Cloud half of Magellan — collects readings from small devices and stores them on Cloudflare. The
device half is `magellan-device`; the two meet only at the contract.

- North star: `docs/DESIGN.md`
- Vocabulary: `docs/CONTEXT.md`
- Conventions: `AGENTS.md`
- Style: `docs/STYLE.md`

## Status

Scaffold. Workspaces are wired and the docs are written; no runtime behaviour yet.

## Setup

```bash
bun install
```

`bun run` lists the scripts, so they are not copied here to rot.

Anything that authenticates to Cloudflare is the maintainer's to run, never an agent's
(`AGENTS.md`). Formatting, typechecking and linting reach nothing and stay agent work.

## Layout

```
packages/contract/   the contract: Zod schemas the cloud parses with
packages/db/         D1 schema and migrations
packages/shared/     token auth, errors, logging
apps/ingest-worker/  device-facing
apps/query-worker/   dashboard-facing, behind Cloudflare Access
apps/jobs-worker/    cron — rollups, retention, silent-device detection
apps/dashboard/      static SPA
tools/simulator/     a fake device that speaks the contract
```

The workspaces exist; what goes in them lands rung by rung. `docs/DESIGN.md` is the stack and the
boundaries.
