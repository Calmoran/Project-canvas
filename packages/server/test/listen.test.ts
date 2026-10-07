import { describe, expect, test } from "vitest";
import { HealthResponseSchema } from "../src/api/index.js";
import {
  LOOPBACK_HOST,
  NonLoopbackHostError,
  startServer,
} from "../src/index.js";

describe("startServer", () => {
  test.each(["0.0.0.0", "::", "::1", "localhost", "192.168.1.10", ""])(
    "refuses to listen on %j",
    async (host) => {
      await expect(startServer({ host, port: 0 })).rejects.toBeInstanceOf(
        NonLoopbackHostError,
      );
    },
  );

  test("listens on 127.0.0.1 and answers over the network", async () => {
    // Port 0: the operating system picks a free port, so parallel test runs
    // never collide.
    const server = await startServer({ port: 0 });
    try {
      const address = server.app.server.address();
      expect(address).toMatchObject({ address: LOOPBACK_HOST });
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const res = await fetch(`${server.url}/api/health`);
      expect(res.status).toBe(200);
      expect(HealthResponseSchema.parse(await res.json()).status).toBe("ok");
    } finally {
      await server.close();
    }
  });
});
