#!/usr/bin/env bash
# Revokes a device's or a client's token in the live store. The row stays, so
# what the token wrote or read stays attributed; the token resolves to nothing.

usage() {
	echo "usage: ${0##*/} <device|client> <id>" >&2
	exit 1
}

(($# == 2)) || usage
case $1 in
	device) table=devices ;;
	client) table=api_clients ;;
	*) usage ;;
esac
id=$2

# packages/shared idPattern: the id reaches a SQL string literal unescaped.
if ! [[ $id =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]]; then
	echo "not an id: '$id'" >&2
	exit 1
fi

cd apps/ingest-worker || exit
bunx wrangler d1 execute DB --remote -c wrangler.prod.jsonc \
	--command "UPDATE $table SET revoked_at = strftime('%s', 'now') * 1000 WHERE id = '$id' AND revoked_at IS NULL"
