# Magellan cloud — the maintainer's: per-clone setup and upgrade. Nothing here
# reaches Cloudflare: deploys are .github/workflows/deploy.yml's. An agent runs
# only the local tree's: help, check, fmt, -n.

include .config/make/base.mk
include .config/make/shell.mk
.DEFAULT_GOAL := help # base.mk defines `deps` first

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

.PHONY: bump-bun bump-actions help

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
