# 6. The client owns presentation

- Status: accepted
- Amends: 0005, where it gives presentation to the cloud and time zone to the viewer

## Chosen

The cloud keeps no presentation. It captures, reconstructs and serves: readings re-scaled by the
manifest they were read under, counter deltas with resets and silences dropped, totals per bucket.
Which metrics are shown, and how, belongs to the client reading that API — a Grafana, a script —
which the cloud neither hosts nor configures. No layouts, no dashboard, no UI.

0005's core stands: the manifest says what a metric is, never how it is shown.

The device declares its time zone in the manifest. A calendar bucket — a day — is cut in the
device's zone, the one a `daily` reset already follows. Resets are still found by the decrease; the
zone crosses the seam for calendar buckets only.

## Why

Charting is solved elsewhere, and building it here spent effort off the mission: capture,
reconstruction, resilience, diagnostics. What a chart tool cannot do is the reconstruction, so that
is what the cloud keeps and serves.

A day belongs to the place the device is, not the viewer: two clients in two zones must agree on
what a daily counter totalled on a date. Only the device knows where it is. This is the need 0005
named as its reversal — a total as of local midnight.

## Cost

Every client builds its own dashboards, and nothing the cloud holds helps them start. The read API
becomes a second published contract, versioned and kept stable for clients this repository never
sees. A device's zone on the wire is one more field the device repository transcribes, and a device
configured in the wrong zone buckets its days wrong with nothing to detect it.

## Reverses

Clients that need shared, cloud-held presentation — dashboards provisioned for them — bring it back
as a client concern first: provisioning files beside the client, not tables here. A device that
moves between zones would need the zone per reading rather than per manifest.
