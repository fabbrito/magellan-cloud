#!/usr/bin/env bash
# Revokes a device's or a client's token in the live store. The row stays, so
# what the token wrote or read stays attributed; the token resolves to nothing.

usage() {
	echo "usage: ${0##*/} <device|client> <id>" >&2
	exit 1
}

(($# == 2)) || usage

statement=$(bun tools/token-cli/src/index.ts revoke "$1" "$2") || exit

cd apps/ingest-worker || exit
bunx wrangler d1 execute DB --remote -c wrangler.prod.jsonc --command "$statement"
