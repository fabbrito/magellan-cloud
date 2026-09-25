import type { Problem } from "@magellan/query";
import type { Context } from "hono";
import type { z } from "zod";

// Every refusal is an RFC 9457 problem: the status, a title a person can act on, and for a
// malformed request the detail of what was wrong. A caller branches on the status, never the text.
export type ProblemStatus = 400 | 401 | 404 | 422 | 500;

// What a refusal names past the standard members, as RFC 9457 allows.
export type Extensions = Record<string, unknown>;

export function problem(
  context: Context,
  status: ProblemStatus,
  title: string,
  extensions: Extensions & { detail?: string } = {},
): Response {
  const body: Problem & Extensions = { type: "about:blank", status, title, ...extensions };
  return context.body(JSON.stringify(body), status, {
    "content-type": "application/problem+json",
  });
}

// One line per issue, bounded: a body of thousands of bad values answers with its first few.
const issuesMax = 8;

export function detailOf(error: z.ZodError): string {
  return error.issues
    .slice(0, issuesMax)
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
