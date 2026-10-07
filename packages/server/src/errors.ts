import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import type { ErrorCode, ErrorResponse } from "./api/index.js";

/** Sends the uniform error body (`ErrorResponse`) with the given status. */
export function sendError(
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): FastifyReply {
  const body: ErrorResponse = {
    error:
      details === undefined ? { code, message } : { code, message, details },
  };
  return reply.status(status).type("application/json").send(body);
}

/**
 * Turns every thrown error into the uniform shape. A request that fails
 * schema validation lists the failing fields; any other client error keeps
 * Fastify's message; a server error never shows its message, because it can
 * carry internals (a file path, a query) that do not belong in a response.
 */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendError(
        reply,
        400,
        "validation_failed",
        "The request did not match the expected shape.",
        error.validation.map((issue) => ({
          in: error.validationContext,
          path: issue.instancePath,
          message: issue.message,
        })),
      );
    }
    const status = error.statusCode ?? 500;
    if (status === 404) {
      return sendError(reply, 404, "not_found", error.message);
    }
    // Other client errors keep their own HTTP status (415, 413, ...), which
    // tells them apart; the code says only that the request was at fault.
    if (status >= 400 && status < 500) {
      return sendError(reply, status, "bad_request", error.message);
    }
    return sendError(
      reply,
      500,
      "internal_error",
      "The server hit an internal error.",
    );
  });
}
