# 5. The device owns meaning, the cloud owns presentation

- Status: accepted

## Chosen

A manifest says what a metric is: its kind, its exponent, its unit, and for a counter whether it
resets. It never says how the metric is shown. Which metrics a dashboard shows, in what order and as
what kind of chart is the cloud's, kept in layouts the maintainer edits.

A counter is monotonic between resets, and any decrease is a reset. A counter that resets on a
cadence says so with `resets: "daily"`, and that cadence is all it says: the boundary is never on
the wire. The cloud finds a reset by the decrease, so a counter restarting on reboot or wrapping
reads the same way without declaring anything. Time zone is presentation: the browser's today, a
site's later.

## Why

The device is at most responsible for what sits down its chain. It knows what a value means; it does
not know who is looking or what they care about. Putting presentation hints in the manifest would
make a dashboard change a device release and a new manifest hash, and would put one viewer's choice
on every device of the same kind.

The reset has to be the device's, because only the device knows a daily total restarts at midnight
rather than going backwards by fault. Declaring the boundary instead — a cron string, a time zone —
would put a clock and a place on the wire, where the device's local clock and the cloud's disagree,
while detecting the decrease needs neither.

## Cost

A layout names metric keys the cloud cannot check against a device it has never heard from; a key a
later manifest drops leaves a card showing history and a note. Every device's dashboard starts empty
until someone builds a layout. The cadence is a single enum value, so a counter that resets weekly
or on a meter read is a contract change.

A decrease is a reset even where it is a fault, so a counter read wrong once looks like a reset and
the delta across it is the new value, not a negative.

## Reverses

A fleet large enough that per-device layouts cost more than they give moves presentation into
templates keyed on something the manifest already carries — still the cloud's, still no manifest
change. A second cadence widens the enum. Only a need to chart the boundary itself — a total "as of
local midnight" the decrease cannot find — would put a time zone on the wire.
