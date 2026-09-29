// Every instant a read answers with: RFC 3339 in UTC, to the millisecond a reading carries.
export function instantOf(ms: number): string {
  return new Date(ms).toISOString();
}
