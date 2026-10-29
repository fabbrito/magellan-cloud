# Deploying

A merge to `main` deploys (ADR 9): `.github/workflows/deploy.yml` runs the check, applies D1
migrations, then deploys ingest, the API and admin, in that order. A change to docs alone deploys
nothing. Rollback is a revert merged like any change, or an older run re-run: migrations stay
forward-compatible (`docs/STYLE.md`), so older code still reads the schema.

D1 and R2 are the maintainer's infrastructure repository's, not this one's. The workflow reads four
secrets from the `production` environment, each only in the steps that call Cloudflare:

| Secret                  | Holds                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | a token scoped to the deploy's needs alone, below           |
| `CLOUDFLARE_ACCOUNT_ID` | the account                                                 |
| `D1_DATABASE_ID`        | the live D1; `scripts/prod-config.sh` renders it into place |
| `ADMIN_TOKEN_HASH`      | the admin token's hash, from `bun run mint:admin`           |

The deploy uploads three Workers, binds resources that already exist and migrates D1, so its token
holds Workers Scripts Edit, D1 Edit and Account Settings Read, on this account alone, and expires.
Nothing more: the deploy creates no resource.

Tokens are minted and revoked through the admin worker, with the admin token; its contract is
`packages/token/openapi.json`. Rotating the admin token is a new secret and a re-run deploy. Should
it be lost, `bun run mint` and `bun run revoke` still print the statements for the live D1's
console.

## Repository settings

The maintainer's, by hand — no workflow holds them, and the workflows assume them. The ruleset is
`.github/rulesets/main.json`: `main` takes no push but a merged PR with `check` green on what it
merges, and no bypass. A PR runs its own copy of `check`, so one that edits `.github/` passes a
check it wrote: there, review is the gate. In order — `selected` comes before its list:

```sh
r=repos/fabbrito/magellan-cloud
for f in .github/rulesets/*.json; do gh api -X POST $r/rulesets --input "$f"; done
gh api -X PUT $r/actions/permissions -F enabled=true -f allowed_actions=selected \
  -F sha_pinning_required=true
gh api -X PUT $r/actions/permissions/selected-actions --input - <<<'{
  "github_owned_allowed": true, "verified_allowed": false,
  "patterns_allowed": ["jdx/mise-action@*"]}'
gh api -X PUT $r/actions/permissions/workflow -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
gh api -X PUT $r/actions/permissions/fork-pr-contributor-approval \
  -f approval_policy=all_external_contributors
gh api -X PATCH $r --input - <<<'{"security_and_analysis": {
  "secret_scanning": {"status": "enabled"},
  "secret_scanning_push_protection": {"status": "enabled"}}}'
gh api -X PUT $r/vulnerability-alerts
gh api -X PUT $r/private-vulnerability-reporting
gh api -X PUT $r/environments/production --input - <<<'{"can_admins_bypass": false,
  "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}'
gh api -X POST $r/environments/production/deployment-branch-policies -f name=main -f type=branch
```

The environment then holds the four secrets above, none at repository level. Dependabot raises
alerts only: `make upgrade` does the bumps. A ruleset change is another run of its file through
`gh api -X PUT $r/rulesets/<id>`.
