# Magellan Cloud

Cloud half of Magellan. What the system is meant to be lives in `docs/DESIGN.md`; it is malleable
until code enacts it, after which the built shape wins and the document catches up. Vocabulary is
`docs/CONTEXT.md`.

**Write terse.** Sacrifice grammar for concision — prose, comments, commits, this file.

## The style guide binds

Read `docs/STYLE.md` before writing code, hold every change to it, and enforce its rules
mechanically wherever a mechanism exists — a config, a lint rule, a test — rather than leaving them
to attention.

## Defer

Defer building until needed; revise decisions as issues surface.

Exempt from deferral — decide before the code lands. The test is reversibility cost, not importance:
an important decision that stays cheap to reverse still defers.

- durable storage shapes — anything written to D1 or R2
- published contracts — anything the device repo already reads
- boundaries later code assumes — layout, naming, dependency direction

## Bun is the package manager, never the runtime

Workers deploy to the Cloudflare runtime, so Bun-only APIs never appear under `packages/` or
`apps/`. `tsconfig.base.json` sets `types: []`, so nothing is inherited and every package declares
its own: a package that never declares `["bun"]` cannot see `Bun.file`, and the mistake fails at
typecheck rather than in production.

## Cloudflare is the maintainer's to run

Anything that authenticates to Cloudflare or calls its API is run by the maintainer, never by an
agent.

Agents write the code and hand over the commands to run. Formatting, typechecking, linting,
`drizzle-kit generate`, `wrangler types`, `wrangler dev` and anything `--local` reach nothing and
stay agent work; deploy, `--remote`, and secret or bucket commands never leave the maintainer's
hands.

## The contract is the seam

The contract is the only interface the device repo shares with this one, and the two repositories
are built independently. A contract change is a version the device repo reads and transcribes — the
two parsers move together, and one repository's copy changed alone breaks the pair.

The cloud has no device-specific word. If a table, column, route or chart names a sensor model, the
boundary has leaked (`docs/CONTEXT.md` > Vocabulary limits).

## Guardrails

- Device tokens and the Cloudflare account id never enter git — env, or a file `.gitignore` already
  covers. A carrier gets its pattern before it holds one. Tokens are stored hashed.
- The repository is meant to be published, and a disclosure is what no later commit undoes.

## Promote what spans

Where knowledge lives, in order: `code > comments > docs > README`. Moving right raises altitude;
write at the lowest level that holds the knowledge.

Knowledge local to one file lives in a comment. Knowledge that spans files, packages or systems gets
promoted. A comment explaining another package is already a doc in the wrong place.

| Where             | Holds                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------- |
| `docs/DESIGN.md`  | what the system is meant to be — layers, invariants, the shape decisions check against |
| `AGENTS.md`       | how to work here — the process an agent follows, never facts about the system          |
| `docs/CONTEXT.md` | domain vocabulary                                                                      |
| `docs/STYLE.md`   | how the code is written — bounds, assertions, naming                                   |
| `README.md`       | orientation — layout, setup, where the docs are                                        |
| `docs/agents/`    | how the engineering skills read this repo — issue tracker, domain docs consumption     |

A settled decision the project still lives under a year from now goes to `docs/adr/` when the first
one lands — what was chosen, what it costs, what reverses it, no paths or symbols. A choice that
steers one session's work does not, and lives outside the repo.

Contradicting a row is allowed. Doing it quietly is not — name the line, and say which of the two
you would change.

**AGENTS.md is not a knowledge base.** The test: a rule that survives the code being rewritten is
process, and stays. A rule that stops being true when the code changes was a doc all along.

Name things in `docs/CONTEXT.md`'s vocabulary. A concept the glossary has no term for is a signal,
not a gap to fill in passing.

## The hidden contract

`.tmp/` holds plan-internal material — plans, handoffs, session scratch — and may go stale. Nothing
in `docs/`, `README.md` or the code references it: they stand alone and publishable.

## Tests bite

A test proves the part under test and fails when that part breaks.

Work outward. Never inward.

| Where        | Mechanism                                  |
| ------------ | ------------------------------------------ |
| Happy path   | **assert** at runtime — crash loud on exit |
| Edges        | tests                                      |
| The specific | regression test the exact bug, once found  |

The cloud is tested against the simulator over the contract, never against a real board.

## Commits

- Never a red tree: every commit passes formatting, lint, typecheck and tests.
- `type(scope): subject`, scope the semantic area rather than the directory. Subject-only by
  default; cut every word the diff already says.
- AI co-authored: `Co-Authored-By:` naming the model. Never a session link — history is permanent.
