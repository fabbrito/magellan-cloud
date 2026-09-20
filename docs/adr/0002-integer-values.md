# 2. A metric value is an integer with a declared exponent

- Status: accepted

## Chosen

A metric declares a decimal exponent beside its unit, and a reading carries whole numbers: the
physical value is the integer scaled by ten to that exponent. The exponent is the metric's, so
re-scaling one produces a new manifest rather than a new kind of reading. A state has neither unit
nor exponent — its value is a code.

The exponent is not a factor. A factor is a decimal, and a decimal on the wire is the binary float
again, one level further from where it can be seen.

## Why

The shape money uses, for the reason money uses it. A device reads whole numbers and scales them by
a published decimal; both fold into an integer and an exponent exactly, and the exactness survives
the wire, the parser, the store and the chart. A binary float cannot hold two decimal places, so the
alternative is a value nearly right everywhere and provably right nowhere.

Integrality stops being a rule and becomes the type: the check that refused a fractional counter,
and the rejection reasons it carried, have no case left to refuse.

## Cost

A quantity whose magnitude outgrows its exponent needs a new manifest — the trade a currency makes
by fixing its minor unit. A value is exact only within the range the cloud's parser is exact in,
which is narrower than a producer's native width, so the ceiling is stated in the contract rather
than discovered.

Every reader scales before it displays. Nothing stores a physical value.

## Reverses

Decimal strings recover the producer's full width at a parse per value on both sides, and need no
change to the exponent. Nothing else about the shape moves.
