/**
 * The app's routes: which view the address bar shows, and the browser's Back
 * and Forward buttons. TanStack Router reads the address and renders the
 * matching route inside the shell's `<Outlet />`.
 *
 * IDs never go in the path (`/explorer?node=spell:116`, not
 * `/explorer/spell:116`): the server treats a last path segment with a dot
 * as a file name, so a reload on such an address would not get the app.
 * Each view declares its own query parameters, typed and checked, in its
 * own issue.
 */
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router";
import type { ApiClient } from "./api/client";
import { CustomTablesView } from "./views/custom-tables";
import { DiffView } from "./views/diff";
import { ExplorerView } from "./views/explorer";
import { FindingsView } from "./views/findings";
import { SetupView } from "./views/setup";

/** What every route can reach without importing it: the API client. */
export interface RouterContext {
  readonly api: ApiClient;
}

/** The five views of architecture section 9, in menu order. */
const VIEWS = [
  { path: "/setup", title: "Setup", component: SetupView },
  { path: "/explorer", title: "Explorer", component: ExplorerView },
  { path: "/findings", title: "Findings", component: FindingsView },
  { path: "/diff", title: "Diff", component: DiffView },
  {
    path: "/custom-tables",
    title: "Custom tables",
    component: CustomTablesView,
  },
] as const;

function Shell() {
  return (
    <>
      <nav aria-label="Views">
        <ul>
          {VIEWS.map((view) => (
            <li key={view.path}>
              <Link to={view.path}>{view.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}

function Home() {
  return <h1>Canvas</h1>;
}

function NotFound() {
  return (
    <section aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found</h1>
      <p>
        Canvas has no page at this address. <Link to="/">Go to the start</Link>.
      </p>
    </section>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Shell,
  notFoundComponent: NotFound,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

const viewRoutes = VIEWS.map((view) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: view.path,
    component: view.component,
  }),
);

const routeTree = rootRoute.addChildren([homeRoute, ...viewRoutes]);

export interface AppRouterOptions {
  readonly context: RouterContext;
  /** The browser's address bar by default; tests pass an in-memory one. */
  readonly history?: RouterHistory;
}

export function createAppRouter({ context, history }: AppRouterOptions) {
  return createRouter({
    routeTree,
    context,
    ...(history === undefined ? {} : { history }),
  });
}

// Tells TanStack Router's types about this app's routes, so `<Link to=...>`
// and `navigate` accept only paths that exist.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
