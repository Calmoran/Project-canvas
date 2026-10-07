import { z } from "zod";

/**
 * The stable, machine-readable reasons a request can fail. Clients branch on
 * these, never on the message text, so a message can be reworded freely.
 */
export const ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "not_found",
  "internal_error",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * The one shape every failed API request answers with, whatever went wrong.
 * The HTTP status says how bad it is; `code` says what happened; `message`
 * is for a person to read; `details` carries extra facts, such as which
 * fields failed validation.
 */
export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
