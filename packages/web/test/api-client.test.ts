// The API client: sends the launch token, checks answers against the server's
// schemas, and turns failures into ApiError with the server's code word.
import { describe, expect, test, vi } from "vitest";
import {
  ApiError,
  createApiClient,
  readLaunchToken,
  TOKEN_META_NAME,
} from "../src/api/client";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createApiClient", () => {
  test("sends the token as a Bearer header to /api/health", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(json(200, { status: "ok", version: "1" })),
    );
    const api = createApiClient({ token: "secret", fetch });

    await expect(api.health()).resolves.toEqual({
      status: "ok",
      version: "1",
    });
    const [path, init] = fetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(path).toBe("/api/health");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer secret",
    );
  });

  test("a Canvas error body becomes an ApiError with its code", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        json(401, {
          error: { code: "bad_request", message: "API requests need a token." },
        }),
      ),
    );
    const error = await createApiClient({ token: "x", fetch })
      .health()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "bad_request",
      message: "API requests need a token.",
    });
  });

  test("an answer that breaks the contract is bad_response", async () => {
    const fetch = vi.fn(() => Promise.resolve(json(200, { status: "fine" })));
    await expect(
      createApiClient({ token: "x", fetch }).health(),
    ).rejects.toMatchObject({ code: "bad_response", status: 200 });
  });

  test("an error status without a Canvas body is bad_response", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response("oops", { status: 502 })),
    );
    await expect(
      createApiClient({ token: "x", fetch }).health(),
    ).rejects.toMatchObject({ code: "bad_response", status: 502 });
  });

  test("no answer at all is network", async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(
      createApiClient({ token: "x", fetch }).health(),
    ).rejects.toMatchObject({ code: "network", status: 0 });
  });
});

describe("readLaunchToken", () => {
  // A stand-in for the page: only querySelector is used.
  const page = (content: string | null): Document =>
    ({
      querySelector: (selector: string) =>
        selector === `meta[name="${TOKEN_META_NAME}"]` && content !== null
          ? { content }
          : null,
    }) as unknown as Document;

  test("reads the token the server wrote into the page", () => {
    expect(readLaunchToken(page("abc"))).toBe("abc");
  });

  test("fails clearly when the page has no token", () => {
    expect(() => readLaunchToken(page(null))).toThrow(/no Canvas launch token/);
    expect(() => readLaunchToken(page(""))).toThrow(/no Canvas launch token/);
  });
});
