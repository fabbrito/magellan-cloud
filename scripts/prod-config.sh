#!/usr/bin/env bash
# Renders the live wrangler config: the committed one, with the real D1 id.

usage() {
	echo "usage: ${0##*/} <database-id> <source> <target>" >&2
	exit 1
}

(($# == 3)) || usage
id=$1
source=$2
target=$3

uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
if ! [[ $id =~ $uuid ]]; then
	echo "not a D1 database id: '$id'" >&2
	exit 1
fi

config=$(<"$source") || exit
placeholder='"database_id": "local"'
if [[ $config != *"$placeholder"* ]]; then
	echo "$source no longer holds $placeholder" >&2
	exit 1
fi

printf '%s\n' "${config/"$placeholder"/"\"database_id\": \"$id\""}" >"$target"
