# 9. The code repo deploys its Workers

- Status: accepted

## Chosen

This repository deploys its own Workers, from CI, on every merge to main: check, migrate D1, then
ingest, then the API. The resources around them — D1, R2, the token the deploy authenticates with —
belong to the maintainer's infrastructure repository, which creates and holds them.

No release tag. A merge is the release; a change to docs alone ships nothing.

## Why

The infrastructure repository owns every resource and would own deploys too, with code repositories
only building. But wrangler deploys a Worker from its source in one command, and CI here already
holds the source, the lockfile and the check. Shipping from the infrastructure repository would mean
a build artifact handed across, and a second place where the deploy order lives.

A tag would buy a named version and a release cadence apart from merges. With one maintainer, a
check on every PR and no staging, the merge is already the deliberate act; a tag would be a second
click on the same decision.

## Cost

Every merge that touches code runs migrations against live D1, so a migration must stay
forward-compatible for one deploy — a drop ships a deploy after its last reader. Rollback is
forward: a revert, or an older run re-run, never D1 rolled back.

The deploy holds an API token as a secret, so who can run the workflow is a security boundary: the
ruleset on main and the production environment are its gate, set by hand.

## Reverses

A second deployment (staging), a second maintainer, or a deploy the infrastructure repository must
order against its own changes — any of these moves the deploy there, or puts a tag in front of it.
