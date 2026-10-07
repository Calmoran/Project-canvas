import { describe, expect, test } from "vitest";
import { withToken } from "../src/web-page.js";

describe("withToken", () => {
  test("puts the meta tag first inside <head>", () => {
    expect(
      withToken('<html><head lang="en"><title>x</title></head></html>', "t1"),
    ).toBe(
      '<html><head lang="en"><meta name="canvas-token" content="t1" /><title>x</title></head></html>',
    );
  });

  test("does not mistake <header> for <head>", () => {
    expect(withToken("<HEAD></HEAD><body><header></header></body>", "t1")).toBe(
      '<HEAD><meta name="canvas-token" content="t1" /></HEAD><body><header></header></body>',
    );
  });

  test("escapes the token for the attribute", () => {
    expect(withToken("<head></head>", 'a"<b>&')).toContain(
      'content="a&quot;&lt;b&gt;&amp;"',
    );
  });

  test("refuses a page with no <head>", () => {
    expect(() => withToken("<body></body>", "t1")).toThrow(/no <head>/);
  });
});
