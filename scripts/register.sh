#!/usr/bin/env bash
# Mints a device token and registers its hash in the live store. The token is
# printed only once the hash is stored.

usage() {
	echo "usage: ${0##*/} <device-id> <description>" >&2
	exit 1
}

(($# == 2)) || usage
device_id=$1
description=$2

{
	IFS= read -r token
	IFS= read -r statement
} < <(bun tools/mint-token/src/index.ts --plain "$device_id" "$description")
[[ -n $statement ]] || exit 1

cd apps/ingest-worker || exit
bunx wrangler d1 execute DB --remote -c wrangler.prod.jsonc \
	--command "$statement" || exit

printf 'token for %s, shown once — store it now:\n\n  %s\n' "$device_id" "$token"
