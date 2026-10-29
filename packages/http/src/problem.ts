import type { Context } from "hono";
import { z } from "zod";

// A refusal's body, RFC 9457.
export const problemSchema = z
  .object({
    type: z.literal("about:blank"),
    status: z.int(),
    title: z.string(),
    detail: z.string().optional(),
  })
  .meta({ description: "RFC 9457. A client branches on the status, never the text." });

export type Problem = z.infer<typeof problemSchema>;

// Every status a worker here refuses with; each route declares the ones it can answer.
export type ProblemStatus = 400 | 401 | 404 | 409 | 413 | 422 | 500;

// What a refusal names past the standard members, as RFC 9457 allows.
export type Extensions = Record<string, unknown>;

// Every refusal is a problem: the status, a title a person can act on, and for a malformed request
// the detail of what was wrong.
export function problem<Status extends ProblemStatus>(
  context: Context,
  status: Status,
  title: string,
  extensions: Extensions & { detail?: string } = {},
) {
  const body: Problem & Extensions = { type: "about:blank", status, title, ...extensions };
  // The caller reads the body; the maintainer reads this, every refusal in one place beside each
  // request's trace. A 500 is `onError`'s to report, as an error.
  if (status < 500) console.warn({ event: "refused", status, title, ...extensions });
  // Spelled as Hono spells it, so it replaces the default rather than sitting beside it.
  return context.json(body, status, { "Content-Type": "application/problem+json" });
}

// One line per issue, bounded: a request of thousands of bad values answers with its first few.
const issuesMax = 8;

// An issue about the whole of what was validated has no path, so it names the part instead: the
// query string, the path parameters or the body.
export function detailOf(error: z.ZodError, target: string): string {
  return error.issues
    .slice(0, issuesMax)
    .map((issue) => `${issue.path.join(".") || target}: ${issue.message}`)
    .join("; ");
}
