#!/usr/bin/env bash
# Mints a token and registers its hash in the live store: a device's, or with
# --client a read API client's. The token is printed only once the hash is stored.

usage() {
	echo "usage: ${0##*/} [--client] <id> <description>" >&2
	exit 1
}

kind=device
flags=()
if [[ ${1-} == --client ]]; then
	kind=client
	flags=(--client)
	shift
fi
(($# == 2)) || usage
id=$1
description=$2

{
	IFS= read -r token
	IFS= read -r statement
} < <(bun tools/mint-token/src/index.ts --plain "${flags[@]}" "$id" "$description")
[[ -n $statement ]] || exit 1

cd apps/ingest-worker || exit
bunx wrangler d1 execute DB --remote -c wrangler.prod.jsonc \
	--command "$statement" || exit

printf 'token for %s %s, shown once — store it now:\n\n  %s\n' "$kind" "$id" "$token"
