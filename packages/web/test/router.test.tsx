// @vitest-environment jsdom
// The app shell and its routes, rendered with React in jsdom (a simulated
// browser page) through Testing Library, which finds elements the way a
// person would: by role and visible text.
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import type { ApiClient } from "../src/api/client";
import { createAppRouter } from "../src/router";

const api: ApiClient = {
  health: () => Promise.resolve({ status: "ok", version: "test" }),
};

async function renderAt(path: string) {
  const router = createAppRouter({
    context: { api },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(() => router.load());
  render(<RouterProvider router={router} />);
  return router;
}

// The router resets the scroll position on navigation; jsdom does not
// implement scrolling and would print a warning for every test.
beforeAll(() => {
  window.scrollTo = () => undefined;
});
afterEach(cleanup);

const VIEWS = [
  ["/setup", "Setup"],
  ["/explorer", "Explorer"],
  ["/findings", "Findings"],
  ["/diff", "Diff"],
  ["/custom-tables", "Custom tables"],
] as const;

describe("routes", () => {
  test.each(VIEWS)("%s shows the %s view", async (path, title) => {
    await renderAt(path);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
      title,
    );
  });

  test("the menu links to all five views", async () => {
    await renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Views" });
    const links = [...nav.querySelectorAll("a")].map((a) => [
      a.getAttribute("href"),
      a.textContent,
    ]);
    expect(links).toEqual(VIEWS.map(([path, title]) => [path, title]));
  });

  test("clicking a menu link switches the view and the address", async () => {
    const router = await renderAt("/setup");
    fireEvent.click(await screen.findByRole("link", { name: "Findings" }));
    await screen.findByRole("heading", { level: 1, name: "Findings" });
    expect(router.state.location.pathname).toBe("/findings");
  });

  test("an unknown address shows the not-found page inside the shell", async () => {
    await renderAt("/no-such-view");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
      "Page not found",
    );
    expect(screen.getByRole("navigation", { name: "Views" })).toBeTruthy();
  });

  test("query strings carry IDs without changing the view", async () => {
    await renderAt("/explorer?node=spell:116");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
      "Explorer",
    );
  });
});
