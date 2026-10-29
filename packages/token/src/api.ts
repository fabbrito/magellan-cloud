import { z } from "zod";

import { descriptionPattern, idPattern, tokenPattern } from "./token.ts";

// The admin contract's bodies, schemas so the document is emitted from what the registry builds.

const instantSchema = z.iso.datetime().meta({ description: "RFC 3339, UTC, to the millisecond." });

export const idSchema = z
  .string()
  .regex(idPattern)
  .meta({ description: "Lowercase letters, digits and dashes; never reused, revoked or not." });

export const registrationSchema = z.object({
  id: idSchema,
  description: z
    .string()
    .regex(descriptionPattern)
    .meta({ description: "What a person recognizes the holder by." }),
});

export type Registration = z.infer<typeof registrationSchema>;

export const tokenRowSchema = z.object({
  id: idSchema,
  description: z.string(),
  created_at: instantSchema,
  revoked_at: instantSchema.nullable().meta({ description: "Revoked, never deleted." }),
});

export type TokenRow = z.infer<typeof tokenRowSchema>;

export const mintedSchema = z.object({
  id: idSchema,
  token: z
    .string()
    .regex(tokenPattern)
    .meta({ description: "Shown once; the cloud keeps only its hash." }),
});
