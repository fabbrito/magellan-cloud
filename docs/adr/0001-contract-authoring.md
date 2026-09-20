# 1. The contract is authored once, in Zod

- Status: accepted

## Chosen

One authoring form: the schema the cloud parses with (Zod). Any document the device reads is derived
from it rather than hand-written, and is emitted when the device repository writes its parser. The
device parses natively rather than generating its types from that document. A manifest is identified
by the SHA-256 of the bytes it was sent as, and the cloud returns that hash when it accepts the
manifest.

## Why

Two hand-written definitions of the same shape drift by transcription, and two prose readings of it
disagree on the corners — an integral-only timestamp, unknown fields, a decimal-string sequence. A
document derived from the parser the cloud actually runs cannot drift from the cloud and is precise
enough for the other language, so it is the interface the device reads.

Rust is written against that document rather than generated from it. Generation would make the sides
one implementation of the shape, so a wrong shape would satisfy both; a native parser keeps them
independent of each other's toolchain while still imposing the document.

A shared corpus of golden cases was the other candidate: it proves behavior the document already
fixes, and it is worst exactly where the sides must agree, because a golden value authored by one
implementation forces the other to reproduce that implementation's bug.

The hash needs no shared rule. Each side hashes the same bytes it sends and receives, so
canonicalization — a byte-level rule that cannot be generated — is gone. Returning the accepted hash
catches the one failure left, a device that hashed different bytes than it sent.

## Cost

Rules the document cannot express — unique metric keys, a non-empty reading — survive only as
description text and stay enforced cloud-side, so the device author must read them. Nothing but an
integration run proves the two parsers agree on the corners.

## Reverses

If a second consumer or a third implementation appears, the device's parser can be generated from
the emitted document without changing the authoring form; only its independence is traded away.
