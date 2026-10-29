import { z } from "zod";

// Every instant an API answers with: RFC 3339 in UTC, to the millisecond a reading carries.
export function instantOf(ms: number): string {
  return new Date(ms).toISOString();
}

export const instantSchema = z.iso
  .datetime()
  .meta({ description: "RFC 3339, UTC, to the millisecond." });
