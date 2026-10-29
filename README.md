# Magellan Cloud

Cloud half of Magellan — collects readings from small devices and stores them on Cloudflare. The
device half is `magellan-device`; the two meet only at the contract.

- North star: `docs/DESIGN.md`
- Vocabulary: `docs/CONTEXT.md`
- Conventions: `AGENTS.md`
- Style: `docs/STYLE.md`
- Grafana: `docs/GRAFANA.md`

## Status

The ingest worker is live and takes a device's manifests and batches. The API worker answers
devices, health and series over the same D1 for clients such as Grafana; the cloud has no UI of its
own.

## Setup

Needs [mise](https://mise.jdx.dev); bun and the gate's tools are pinned in `.config/mise/conf.d/`.

```bash
make deps    # the pinned tools, then bun install
make hooks   # once per clone: lefthook's git hooks
make upgrade # every pin and dependency, cooled three days, then fmt and check; a clean tree first
```

`bun run` lists the scripts, so they are not copied here to rot.

Anything that authenticates to Cloudflare is the maintainer's to run, never an agent's
(`AGENTS.md`). The split is in the tool: `bun run` reaches the local store at most; `make` is the
maintainer's — per-clone setup and upgrades — but for `help`, `check`, `fmt` and `-n`; deploys are
CI's.

## Running it

```bash
bun run dev                                      # local migrations, then ingest :8787, api :8788, admin :8789
bun run dev:ingest                               # or one of them alone: dev:ingest, dev:api, dev:admin
bun run mint <device|client> <id> <description>  # a token, and the statement that registers it
bun run dev:reset                                # drop the local store; the next dev rebuilds it
```

`dev` serves the workers in workerd against one local D1 and R2 under `.wrangler/state` at the root,
so the API worker reads what ingest commits. That store persists across restarts, registered devices
included, and `dev:reset` is the only thing that clears it. It is not the store the tests use — they
boot their own and throw it away, so a test run leaves it untouched.

The admin worker wants `apps/admin-worker/.dev.vars`, copied from its `.dev.vars.example` with the
hash `bun run mint admin` prints; without it, every request to it is a 500.

### Against the device

`magellan-device` points at this worker through its `config.toml`:

```toml
[cloud]
endpoint = "http://127.0.0.1:8787/v1"
```

`MAGELLAN_DEVICE_ID` and `MAGELLAN_TOKEN` come from `bun run mint device`, whose printed statement
registers the hash here. The device refuses plain http unless it is loopback, so one running on
another host wants a tunnel to this one rather than a LAN address.

## Deploying

A merge to `main` deploys: `.github/workflows/deploy.yml` runs the check, applies D1 migrations,
then deploys ingest, the API and admin, in that order. A change to docs alone deploys nothing.
Rollback is a revert merged like any change, or an older run re-run: migrations stay
forward-compatible (`docs/STYLE.md`), so older code still reads the schema.

D1 and R2 are the maintainer's infrastructure repository's, not this one's. The workflow reads four
secrets from the `production` environment:

| Secret                  | Holds                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | the "Edit Cloudflare Workers" template, plus D1 Edit        |
| `CLOUDFLARE_ACCOUNT_ID` | the account                                                 |
| `D1_DATABASE_ID`        | the live D1; `scripts/prod-config.sh` renders it into place |
| `ADMIN_TOKEN_HASH`      | the admin token's hash, from `bun run mint admin`           |

Repository settings, set by hand — the workflows assume them:

- Actions: approval required for every external contributor's PR; `GITHUB_TOKEN` read-only by
  default; full-length SHA pins required; only GitHub's actions and those named in the workflows.
- A ruleset on `main`: a PR, `check` passing, no force-push, no deletion, no bypass.
- Environment `production`: deploys from `main` only; the secrets above, none at repository level.

Tokens are minted and revoked through the admin worker, with the admin token; its contract is
`packages/token/openapi.json`. Rotating the admin token is a new secret and a re-run deploy. Should
it be lost, `bun run mint` and `bun run revoke` still print the statements for the live D1's
console.

## Layout

```
packages/contract/   the contract: Zod schemas, and openapi.json emitted from the routes
packages/db/         D1 schema and migrations
packages/ingest/     a device's writes: manifests, batches, heartbeats, archived then committed
packages/query/      reads, rollups, row schemas, and the read openapi.json
packages/token/      tokens: minted, hashed, resolved, revoked, and the admin openapi.json
apps/ingest-worker/  device-facing
apps/api-worker/     client-facing read API
apps/admin-worker/   maintainer-facing: mints, revokes and lists tokens
tools/simulator/     a fake device that speaks the contract
tools/emit-openapi/  writes the openapi.json files from the workers' routes
tools/token-cli/     mints the admin token, or a token as the statement to run
scripts/             shell for the deploy workflow
```

Apps and tools are transport; what they do lives in packages
(`docs/adr/0008-apps-are-transport.md`). The workspaces exist; what goes in them lands
incrementally. `docs/DESIGN.md` is the stack and the boundaries.
