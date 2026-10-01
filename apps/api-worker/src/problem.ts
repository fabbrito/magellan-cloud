import type { Problem } from "@magellan/query";
import type { Context } from "hono";
import type { z } from "zod";

// Every refusal is an RFC 9457 problem: the status, a title a person can act on, and for a
// malformed request the detail of what was wrong. A caller branches on the status, never the text.
export type ProblemStatus = 400 | 401 | 404 | 422 | 500;

// What a refusal names past the standard members, as RFC 9457 allows.
export type Extensions = Record<string, unknown>;

export function problem<Status extends ProblemStatus>(
  context: Context,
  status: Status,
  title: string,
  extensions: Extensions & { detail?: string } = {},
) {
  const body: Problem & Extensions = { type: "about:blank", status, title, ...extensions };
  // The client reads the body; the maintainer reads this, every client's refusals in one place
  // beside each request's trace. A 500 is `onError`'s to report, as an error.
  if (status < 500) console.warn({ event: "refused", status, title, ...extensions });
  // Spelled as Hono spells it, so it replaces the default rather than sitting beside it.
  return context.json(body, status, { "Content-Type": "application/problem+json" });
}

// One line per issue, bounded: a request of thousands of bad values answers with its first few.
const issuesMax = 8;

// An issue about the whole of what was validated has no path, so it names the part instead: the
// query string or the path parameters, never a body the request did not send.
export function detailOf(error: z.ZodError, target: string): string {
  return error.issues
    .slice(0, issuesMax)
    .map((issue) => `${issue.path.join(".") || target}: ${issue.message}`)
    .join("; ");
}
