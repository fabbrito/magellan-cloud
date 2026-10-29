import type { Problem } from "@magellan/query";
import type { Context } from "hono";
import type { z } from "zod";

// Every refusal is an RFC 9457 problem, as the read API's: a caller branches on the status, never
// the text.
export type ProblemStatus = 400 | 401 | 404 | 409 | 413 | 500;

export function problem<Status extends ProblemStatus>(
  context: Context,
  status: Status,
  title: string,
  extensions: { detail?: string } = {},
) {
  const body: Problem = { type: "about:blank", status, title, ...extensions };
  // A 500 is `onError`'s to report, as an error.
  if (status < 500) console.warn({ event: "refused", status, title, ...extensions });
  // Spelled as Hono spells it, so it replaces the default rather than sitting beside it.
  return context.json(body, status, { "Content-Type": "application/problem+json" });
}

// One line per issue, bounded: a body of thousands of bad values answers with its first few.
const issuesMax = 8;

export function detailOf(error: z.ZodError, target: string): string {
  return error.issues
    .slice(0, issuesMax)
    .map((issue) => `${issue.path.join(".") || target}: ${issue.message}`)
    .join("; ");
}
