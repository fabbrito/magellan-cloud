# Magellan cloud — every target but help acts on the live deploy. The
# maintainer runs them.

-include cloudflare.prod.env

worker := apps/ingest-worker
config := $(worker)/wrangler.prod.jsonc
wrangler := cd $(worker) && bunx wrangler

need = $(if $($(1)),,$(error $(1) is unset))

# Through the environment, so quotes in the SQL reach wrangler intact.
export SQL

.PHONY: help bootstrap migrate deploy takedown tail sql register probe probe-ceiling

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
	@awk "$$HELP_AWK" $(firstword $(MAKEFILE_LIST))

bootstrap: ## create D1 and R2 - the D1 id goes in cloudflare.prod.env
	$(wrangler) d1 create magellan
	$(wrangler) r2 bucket create magellan-archive

$(config): $(worker)/wrangler.jsonc cloudflare.prod.env
	$(call need,D1_DATABASE_ID)
	scripts/prod-config.sh $(D1_DATABASE_ID) $< $@

##@ Deploy
migrate: $(config) ## apply D1 migrations
	$(wrangler) d1 migrations apply DB --remote -c wrangler.prod.jsonc

deploy: $(config) ## deploy the ingest worker
	$(wrangler) deploy -c wrangler.prod.jsonc

takedown: $(config) ## delete the worker - D1 and R2 stay
	$(wrangler) delete -c wrangler.prod.jsonc

register: $(config) ## mint and register a token - ID=, DESCRIPTION=
	$(call need,ID)
	$(call need,DESCRIPTION)
	scripts/register.sh $(ID) '$(DESCRIPTION)'

##@ Observe
# JSON carries each invocation's CPU time. *.prod.* keeps the log out of git.
tail: $(config) ## stream invocations, appended to logs/tail.prod.jsonl
	@mkdir -p logs
	$(wrangler) tail -c wrangler.prod.jsonc --format json | tee -a $(CURDIR)/logs/tail.prod.jsonl

sql: $(config) ## query the live D1 - SQL="<statement>"
	$(call need,SQL)
	$(wrangler) d1 execute DB --remote -c wrangler.prod.jsonc --command "$$SQL"

probe: ## walk a simulated boot against the endpoint
	$(call need,ENDPOINT)
	$(call need,PROBE_DEVICE_ID)
	$(call need,PROBE_TOKEN)
	@bun tools/simulator/src/cli.ts $(ENDPOINT) $(PROBE_DEVICE_ID) $(PROBE_TOKEN) $(run)

probe-ceiling: run := ceiling
probe-ceiling: probe ## send the largest manifest and batch
