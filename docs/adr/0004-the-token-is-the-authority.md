# 4. The token is the authority; the path is a claim

- Status: accepted

## Chosen

A device's credential is the authority on which device it is: one revocable token per device, and it
alone resolves the device. The path's `{id}` is a claim the request makes, checked against the
token; a mismatch is refused `403`, the class that keeps the device's buffer and retries.

A hierarchy above devices — `sites > plants > devices` — may be added to the registry later, and
this shape is what keeps that a registry change rather than a contract change. Re-parenting a device
is a row, not a new token and not a new environment.

## Why

Identity has to survive the hierarchy arriving without the wire moving. With the path authoritative,
re-parenting a device would mean a new path and a new declaration; with the token only
authenticating a path-supplied identity, one device's token could be pointed at another's readings
by editing a URL. Making the token the authority fixes the device at the credential, so the path is
a convenience that is always checked and never trusted.

`403` and not `400`: a mismatch is not malformed input, it is a request naming a device the
credential does not speak for. Both are fixed by the maintainer, not by the device, so the
keep-and-backoff class is right — and a wrong id that dropped the buffer would lose readings to a
typo.

## Cost

Every route carrying `{id}` must resolve the token and compare, so the id is carried but never the
source of identity: a second thing that can disagree, and a refusal path that must be exercised or a
mismatch sails through. A device configured with the wrong id stalls, retrying forever, rather than
being told finally that it is misconfigured.

The hierarchy is deferred, so the registry is flat today and this buys only the ability to add the
level without a wire change. Nothing here keeps a site or plant off the wire; a later change that
put one there would cross the seam this defers.

## Reverses

If a token ever authorizes a set of devices rather than one — a fleet or tenant token — the path id
becomes the identity and the token only authenticates it. That is also when the org hierarchy would
have to reach the wire, the token no longer naming a single device.
