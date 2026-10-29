# Magellan cloud — the maintainer's: per-clone setup, upgrade, and the Tokens
# targets, which act on the live D1. Deploys are .github/workflows/deploy.yml's.
# An agent runs only the local tree's: help, check, fmt, -n.

include .config/make/base.mk
include .config/make/shell.mk
.DEFAULT_GOAL := help # base.mk defines `deps` first

-include cloudflare.prod.env

ingest := apps/ingest-worker
ingest_config := $(ingest)/wrangler.prod.jsonc

need = $(if $($(1)),,$(error $(1) is unset))

# The token lives in one child's env, never the shell's; a failed lookup stops
# the recipe rather than falling back to a stored login.
auth = $(call need,CLOUDFLARE_TOKEN_CMD)$(call need,CLOUDFLARE_ACCOUNT_ID)token=$$($(CLOUDFLARE_TOKEN_CMD)) && CLOUDFLARE_API_TOKEN=$$token
# Names the account, so the token needs no scope to look it up.
export CLOUDFLARE_ACCOUNT_ID

# The TS lanes are package.json's, where an agent runs them: make delegates, one
# definition, two entries. Shell and lefthook's own are the includes'.
check::
	bun run check

fmt::
	bun run fix

# The workflows' lanes: lefthook.yml's actionlint and pinact, over the tree.
check::
	actionlint
	pinact run --fix=false --no-api

# package.json's `update`: every workspace (-r), past the declared ranges
# (--latest) - `^0.x` holds a minor - picked by hand (-i), so a major stays a
# decision. Cooled too: `bun outdated` marks Latest held by bunfig.toml.
bump: bump-bun bump-actions

bump-bun:
	bun run update

# Every action to its newest sha, cooled as mise and bun are.
bump-actions:
	pinact run -u -m 3

.PHONY: bump-bun bump-actions help register register-client revoke-device revoke-client

define HELP_AWK
BEGIN {
	FS = ":.*##"
	printf "\nUsage: make \033[1m<target>\033[0m\n"
	printf "       make -n \033[1m<target>\033[0m prints its recipe, runs nothing\n"
}
/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }
/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }
endef
export HELP_AWK

##@ Setup
help: ## show this help
	@awk "$$HELP_AWK" $(MAKEFILE_LIST)

# mise exec: PATH was read before mise install.
deps::
	mise exec -- bun install

%/wrangler.prod.jsonc: %/wrangler.jsonc cloudflare.prod.env
	$(call need,D1_DATABASE_ID)
	scripts/prod-config.sh $(D1_DATABASE_ID) $< $@

##@ Tokens
register: $(ingest_config) ## mint and register a device token - ID=, DESCRIPTION=
	$(call need,ID)
	$(call need,DESCRIPTION)
	$(auth) scripts/register.sh device $(ID) '$(DESCRIPTION)'

register-client: $(ingest_config) ## mint and register a read API client token - ID=, DESCRIPTION=
	$(call need,ID)
	$(call need,DESCRIPTION)
	$(auth) scripts/register.sh client $(ID) '$(DESCRIPTION)'

revoke-device: $(ingest_config) ## revoke a device's token - ID=
	$(call need,ID)
	$(auth) scripts/revoke.sh device $(ID)

revoke-client: $(ingest_config) ## revoke a client's token - ID=
	$(call need,ID)
	$(auth) scripts/revoke.sh client $(ID)
