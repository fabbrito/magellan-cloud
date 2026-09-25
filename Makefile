# Magellan cloud — every target but help acts on the live deploy. The
# maintainer runs them.

-include cloudflare.prod.env

ingest := apps/ingest-worker
api    := apps/api-worker
ingest_config := $(ingest)/wrangler.prod.jsonc
configs := $(ingest_config) $(api)/wrangler.prod.jsonc

need = $(if $($(1)),,$(error $(1) is unset))
# A choice of worker, named every time: no default to act on by accident.
need_worker = $(call need,WORKER)$(if $(filter ingest api,$(WORKER)),,$(error WORKER is ingest or api))

# The token lives in one child's env, never the shell's; a failed lookup stops
# the recipe rather than falling back to a stored login.
auth = $(call need,CLOUDFLARE_TOKEN_CMD)$(call need,CLOUDFLARE_ACCOUNT_ID)token=$$($(CLOUDFLARE_TOKEN_CMD)) && CLOUDFLARE_API_TOKEN=$$token
wrangler_in = cd $(1) && $(auth) bun x wrangler
wrangler = $(call wrangler_in,$(ingest))

# Names the account, so the token needs no scope to look it up.
export CLOUDFLARE_ACCOUNT_ID

# Through the environment, so quotes in the SQL reach wrangler intact. Taken
# unexpanded: make would otherwise read a JSON path's `$.key` as a variable.
override SQL := $(value SQL)
export SQL

.PHONY: help bootstrap migrate deploy takedown tail sql register register-client revoke-device revoke-client probe probe-ceiling

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

%/wrangler.prod.jsonc: %/wrangler.jsonc cloudflare.prod.env
	$(call need,D1_DATABASE_ID)
	scripts/prod-config.sh $(D1_DATABASE_ID) $< $@

##@ Deploy
migrate: $(ingest_config) ## apply D1 migrations
	$(wrangler) d1 migrations apply DB --remote -c wrangler.prod.jsonc

# Ingest first: after a migration, the running one may write a shape the
# database no longer takes, and the device's buffer holds until it is replaced.
deploy: $(configs) ## deploy the ingest and API workers
	$(wrangler) deploy -c wrangler.prod.jsonc
	$(call wrangler_in,$(api)) deploy -c wrangler.prod.jsonc

takedown: $(configs) ## delete both workers - D1 and R2 stay
	$(call wrangler_in,$(api)) delete -c wrangler.prod.jsonc
	$(wrangler) delete -c wrangler.prod.jsonc

##@ Tokens
register: $(ingest_config) ## mint and register a device token - ID=, DESCRIPTION=
	$(call need,ID)
	$(call need,DESCRIPTION)
	$(auth) scripts/register.sh $(ID) '$(DESCRIPTION)'

register-client: $(ingest_config) ## mint and register a read API client token - ID=, DESCRIPTION=
	$(call need,ID)
	$(call need,DESCRIPTION)
	$(auth) scripts/register.sh --client $(ID) '$(DESCRIPTION)'

revoke-device: $(ingest_config) ## revoke a device's token - ID=
	$(call need,ID)
	$(auth) scripts/revoke.sh device $(ID)

revoke-client: $(ingest_config) ## revoke a client's token - ID=
	$(call need,ID)
	$(auth) scripts/revoke.sh client $(ID)

##@ Observe
# JSON carries each invocation's CPU time. *.prod.* keeps the log out of git.
tail: $(configs) ## stream invocations to logs/tail.prod.jsonl - WORKER=ingest|api
	$(call need_worker)
	@mkdir -p logs
	$(call wrangler_in,$($(WORKER))) tail -c wrangler.prod.jsonc --format json | tee -a $(CURDIR)/logs/tail.prod.jsonl

sql: $(ingest_config) ## query the live D1 - SQL="<statement>"
	$(call need,SQL)
	$(wrangler) d1 execute DB --remote -c wrangler.prod.jsonc --command "$$SQL"

probe: ## walk a simulated boot against the endpoint
	$(call need,ENDPOINT)
	$(call need,PROBE_DEVICE_ID)
	$(call need,PROBE_TOKEN)
	@bun tools/simulator/src/cli.ts $(ENDPOINT) $(PROBE_DEVICE_ID) $(PROBE_TOKEN) $(run)

probe-ceiling: run := ceiling
probe-ceiling: probe ## send the largest manifest and batch
