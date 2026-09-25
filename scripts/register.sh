#!/usr/bin/env bash
# Mints a device's or a client's token and registers its hash in the live store.
# The token is printed only once the hash is stored.

usage() {
	echo "usage: ${0##*/} <device|client> <id> <description>" >&2
	exit 1
}

(($# == 3)) || usage
kind=$1
id=$2
description=$3

{
	IFS= read -r token
	IFS= read -r statement
} < <(bun tools/token/src/index.ts mint --plain "$kind" "$id" "$description")
[[ -n $statement ]] || exit 1

cd apps/ingest-worker || exit
bunx wrangler d1 execute DB --remote -c wrangler.prod.jsonc \
	--command "$statement" || exit

printf 'token for %s %s, shown once — store it now:\n\n  %s\n' "$kind" "$id" "$token"
