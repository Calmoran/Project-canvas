import { z } from "zod";

/** `GET /api/health`: answers when the server is up and serving requests. */
export const HealthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
