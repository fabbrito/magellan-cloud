# 6. The client owns presentation

- Status: accepted, amended in place — raw counters, no deltas
- Amends: 0005, where it gives presentation to the cloud and time zone to the viewer

## Chosen

The cloud keeps no presentation. It captures and serves: readings re-scaled by the manifest they
were read under, a counter's raw value included, and rollups per bucket — a gauge's mean, a
counter's or a state's last value. Nothing is derived from adjacent readings. Which metrics are
shown, and how, belongs to the client reading that API — a Grafana, a script — which the cloud
neither hosts nor configures. No layouts, no dashboard, no UI.

0005's core stands: the manifest says what a metric is, never how it is shown.

The device declares its time zone in the manifest. A calendar bucket — a day — is cut in the
device's zone, the one a `daily` reset already follows. Resets are still found by the decrease; the
zone crosses the seam for calendar buckets only.

## Why

Charting is solved elsewhere, and building it here spent effort off the mission: capture,
resilience, diagnostics. What a chart tool cannot know is the manifest a reading was read under and
the zone its day is cut in, so that is what the cloud applies.

Counter deltas are not served for now: a reading lost inside the silence threshold folds two
intervals into one, drawn as a spike. A raw value loses a point and stays true. A counter is shown
as a number; what is charted is a gauge the device measures.

A day belongs to the place the device is, not the viewer: two clients in two zones must agree on
what a daily counter totalled on a date. Only the device knows where it is. This is the need 0005
named as its reversal — a total as of local midnight.

## Cost

Every client builds its own dashboards, and nothing the cloud holds helps them start. The read API
becomes a second published contract, versioned and kept stable for clients this repository never
sees. A device's zone on the wire is one more field the device repository transcribes, and a device
configured in the wrong zone buckets its days wrong with nothing to detect it. A daily counter's day
is its last reading in that day, missing what accrued after it, and after a mid-day reset holding
only what followed.

## Reverses

Clients that need shared, cloud-held presentation — dashboards provisioned for them — bring it back
as a client concern first: provisioning files beside the client, not tables here. A device that
moves between zones would need the zone per reading rather than per manifest. A client that needs a
counter's increase across resets and silences brings deltas back as a served rollup, beside the raw
value rather than in place of it.
