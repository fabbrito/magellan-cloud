# 8. Apps are transport

- Status: accepted

## Chosen

A worker is an app; so is a tool, an app for internal use. An app holds its transport — routes,
guards, the credential check, how a refusal is answered, a command line's arguments. What it does
lives in a package, which the app calls.

A guideline, not a gate. Nothing enforces it, and a violation now and then is expected; one that
lasts is worth a move.

A tool whose logic serves nothing but itself stays whole. The simulator is one: a fake device, not a
library, though the suites drive it.

## Why

The read path already had this shape and the write path did not, so where a piece of logic lived
depended on which worker it served. One rule answers where new code goes before it is written, and
keeps an app small enough to read as its routes.

## Cost

A package with one consumer — each worker's logic has exactly one. A move across workspaces where a
file would otherwise stay put, and a manifest, a tsconfig and an entry point for each.

A package boots nothing to test. Its unit tests sit beside its source and cover what is pure; what
it writes and reads is proven through its app's booted tests, so logic left inside an I/O function
goes unproven by the package — pull it out to test it.

## Reverses

Packages that only ever have one consumer, and moves that cost more than the reading they save, fold
the logic back into its app; packages then hold only what two workspaces share.
