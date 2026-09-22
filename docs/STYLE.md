# Style

The rulebook for writing code here, adapted from
[TigerStyle](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md) — that is
where the rules and their reasons come from.

Goals, in order: **a correct record, then cost, then developer experience.** Cost is a hard budget:
a shape that cannot fit it is wrong, not a budget to raise.

Simplicity is the last draft, not the first. It takes sketches, passes and a throwaway to land, and
paying for that in the design is what keeps it out of production.

The language is TypeScript on a managed runtime. Names on the wire belong to the contract — read,
not chosen.

## There is no process here

Nothing restarts, so any rule that assumes a fresh process does not transfer.

- A thrown error fails one request. It is not a restart and it is not a safety net.
- State that must outlive a request is written down. Module scope is at best a cache, shared with
  whatever else runs in the same instance, and empty in the next one.
- Two requests can be in flight in one instance, so module-scope mutation is a race, not a cache.
- Work at module scope is paid every time an instance starts. Keep it to imports and constants.
- Nothing here keeps a clock. Scheduled work is a separate, explicit trigger — never a timer or a
  background loop.

## Await is a suspension

- A precondition does not survive an `await`. Re-check after it, or hold nothing shared across it.
- Don't carry a value proved good across an `await` without saying what could have changed it.
- Work that must be atomic is one write, not a sequence of them.

## Parse, then trust the type

- Data from outside is untrusted until parsed. After parsing it is typed, and typed values are not
  re-validated.
- The parser is a boundary, not a checkpoint: everything past it takes typed values only.
- **Assertions live behind the parser.** An assertion a valid request can reach turns a bug into a
  retry, and a retry the sender never stops making is data its buffer eventually drops.
- The compiler stays at its strictest setting. No `any`, no non-null assertion, no cast to silence a
  mismatch.
- A cast is a seam: name it, say why, and keep it in one place.
- Prefer a discriminated union to optional fields that can contradict each other, and switch over it
  exhaustively.
- Import a package through its entry point, never past it into a file, and never into a cycle.

## Errors are the contract

- Every failure lands on a response class, and the class is chosen: retryable for a fault, final for
  a refusal. A retryable class on a deterministic bug is a storm.
- A failure the caller can act on is a value; an exception is for what cannot be handled here.
- Handle every error. Most catastrophic failures are error paths that were never exercised.
- A log is not a report. A bug that must be noticed needs a signal someone reads.

## Bound everything

A loop, a batch, a body, a collection, a retry: everything has a limit, so state it. A bound turns a
spike into a refusal instead of a timeout, and an unbounded shape into a bill. A loop that cannot
terminate is asserted.

State a bound where it is enforced, once, so the bound a reader trusts is the bound in force.

## Shape

- **No recursion.** Every execution that should be bounded is bounded.
- **70 lines per function, hard.** Art is born of constraints, and few things are worth a scroll.
- **Push `if`s up, `for`s down.** One function owns the control flow; what it calls is branch-free
  and pure.
- **Smallest scope, latest declaration.** Compute a value where it is used, and keep few variables
  in scope: the gap between a check and its use is where bugs live.
- **Say invariants positively.** State the condition under which the invariant holds, never the one
  under which it fails.
- **Split compound conditions** into nested branches, so every case is visible and none is implied.
- **Explicit options at the call site**, never an inherited default: a default that changes is a bug
  arriving without a diff.
- **Fewer return dimensions.** Prefer `void` to `bool`, `bool` to a number, a number to a nullable.
- **Few abstractions, and excellent ones.** Every abstraction can leak, and none is free.
- **No duplicate state.** A second copy is a second thing to keep in sync.
- **Batch the I/O.** A write in a loop is a round trip per row, and every row is charged; one call
  carrying many rows costs one wait.

## Naming

- Get the nouns and verbs right. A name is where understanding of the domain shows, or fails to.
- **No abbreviations**, except where a platform fixes the name: the D1 binding is `env.DB`, so `db`,
  `getDb` and `Db` carry it rather than putting a second word beside it. `source`, not `src`; a long
  flag over a short one.
- **Units and qualifiers last, most significant word first**: `latencyMsMax`, `latencyMsMin`.
  Related names then group and line up.
- `camelCase` in TypeScript, `snake_case` in SQL and on the wire.
- Related names the same length, so calculations line up and symmetry is visible.
- Don't overload a word, and don't let a name mean two things by context.
- Name a thing as it will be referred to — a noun survives being a heading or a column; a participle
  does not.

## Comments

A comment carries knowledge from outside the code it sits on: why this choice, what breaks
otherwise, the gotcha an API hides. Narration of the code below it goes stale and dies. One line
where one line does.

## Cost

Of the four resources — network, disk, memory, CPU — the first two are waited on and the last two
are spent. The machine is shared and metered, so what a request spends is bounded, and what a day
writes is bounded harder.

Sketch the work before writing it. No microbenchmarks: a bound is justified by the rows one write
touches and by the sender's buffer, never by a synthetic timing taken somewhere other than the
target.

## Dependencies

Few, and never idly. A dependency is supply chain, start-up cost, and another thing to keep strict —
and it has to run where this runs. Foundational code carries the fewest; nothing foundational is
worth a convenience.

Prefer a tool already in the repository; adding one costs more than it looks.

## Formatting

The formatter and the linter decide, at the commit gate: 100 columns as a hard limit and never a
horizontal scrollbar, 2-space indents, sorted imports, no warnings.
