# WEB-2 (#25): choices for Alex

**Status:** decided 2026-10-07. Alex chose the lean on every point (relayed by the PM). The Architect records the decision in `docs/decisions.md`.

Worker-web, 2026-10-07. The issue, the architecture and bead s8g's notes already settle most of the web app skeleton: Vite 8, React 19, `@xyflow/react` 12, Zustand 5, ELK `layered` in a Web Worker, the error shape, the launch token sent as `Authorization: Bearer <token>` read from the `canvas-token` meta tag, and IDs in query strings, never in the path. The seven points below are not settled, and the code changes depending on the answers. Each has options with their trade-offs and my lean.

## 1. Router: how the app switches between its five views

A router maps the address bar (`/explorer?node=spell:116`) to the view on screen and keeps the browser's Back button working.

| Option                                                       | For                                                                                                                                                                                                             | Against                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A. TanStack Router** 1.170 (MIT)                           | Query-string parameters are typed and validated (a schema per route). Canvas keeps every ID in the query string (`node=`, `hops=`, `snapshot=`), so the compiler catches a misspelt or wrongly typed parameter. | Larger API to learn; its file-based routing is optional and not used here.                     |
| B. React Router 8.4 (MIT)                                    | The most widely used router; plain, well documented.                                                                                                                                                            | Query parameters are untyped strings; Canvas would validate them by hand in each view.         |
| C. wouter 3.13 (Unlicense)                                   | Tiny, minimal.                                                                                                                                                                                                  | Untyped query parameters; fewer features (no data loading or route-level error handling).      |
| D. No library: about 50 lines over the browser's History API | Nothing to depend on.                                                                                                                                                                                           | Canvas owns Back/Forward handling, link clicks and parameter parsing; that is where bugs hide. |

Lean: **A**, because typed query parameters match how Canvas addresses everything.

## 2. Component tests: where React components run in tests

| Option                                                             | For                                                                                                 | Against                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A. Vitest + jsdom 30 + Testing Library**                         | The standard setup; fast; runs in Node like every other Canvas test; no browser on the CI machines. | jsdom is a simulated browser: no real layout, no Web Workers, no canvas drawing. |
| B. Vitest + happy-dom 20                                           | Faster than jsdom.                                                                                  | Less complete simulation; more edge-case differences from real browsers.         |
| C. Vitest browser mode (real headless Chromium through Playwright) | Real browser: real layout, workers, events.                                                         | Needs a Chromium download in CI (on Windows too); slower; one more moving part.  |

Lean: **A** for component tests now. Real-browser checks belong to the Playwright smoke test (WEB-10) the architecture already plans.

## 3. ELK in a Web Worker: whose worker file

A Web Worker is a second thread in the page, so a slow layout never freezes the screen.

| Option                                                                               | For                                                                                           | Against                                                                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Canvas's own small worker module** that loads ELK and answers `layout` messages | Typed messages end to end; Canvas controls errors and cancellation; Vite bundles it normally. | About 40 lines to write and test.                                                                                                     |
| B. elkjs's shipped worker file (`elk-worker.min.js`), wired through `workerUrl`      | Less code.                                                                                    | The ELK API wraps the worker; error handling and cancellation are ELK's; the shipped file is pre-built and minified, harder to audit. |

Lean: **A**.

## 4. Where the web build lands, and git

The architecture says the built web app is served from a fixed folder in the server package (`packages/server/public`), which the web build copies into. That folder now holds a committed placeholder `index.html`. Building writes over it, which leaves a modified tracked file after every build.

| Option                                                                                                                    | For                                                 | Against                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Vite writes straight into `packages/server/public`; that folder becomes git-ignored and the placeholder is deleted** | One build step; nothing tracked changes on a build. | Touches lane-ops files (`.gitignore`, the placeholder). A server started before any web build has no page (the server's tests already use their own fixture). |
| B. The same, but the placeholder moves to a server fixture and is copied in when the folder is empty                      | The server always has a page.                       | More moving parts for a case only developers hit.                                                                                                             |
| C. Keep the placeholder tracked and accept a modified file after builds                                                   | No change to lane-ops files.                        | Easy to commit build output by accident.                                                                                                                      |

Lean: **A**, with the `.gitignore` line and the placeholder removal in this PR, agreed with worker-ops through the PM.

## 5. The meta tag's name in one place

The server writes `<meta name="canvas-token">` (`TOKEN_META_NAME` in `packages/server/src/web-page.ts`). The lint rule lets the web app import only `@canvas/server/api`, so it cannot import that constant today.

| Option                                                                       | For                                                                      | Against                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **A. Move `TOKEN_META_NAME` (and `TOKEN_SCHEME`) into `@canvas/server/api`** | One definition; renaming it on one side cannot silently break the other. | A small edit in lane-ops's package.                             |
| B. Repeat the string in the web app                                          | No cross-lane edit.                                                      | Two copies that can drift; a test can only catch it end to end. |

Lean: **A**.

## 6. Running the app while developing

Vite's development server reloads the page on every save. But a page served by Vite carries no token, and the API refuses requests without one.

| Option                                                                                                                                                                | For                                                                                           | Against                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. A small Vite plugin used only in development** starts a Canvas server in the same process (port 0), writes its token into Vite's page, and forwards `/api` to it | One command (`pnpm --filter @canvas/web dev`); the token rules stay exactly as in production. | The development config imports `@canvas/server` itself, so the lint rule needs a one-file exception for `vite.config.ts`, which never reaches the browser. |
| B. No dev server: build, then open the real server                                                                                                                    | Nothing new.                                                                                  | Every change needs a rebuild; slow.                                                                                                                        |
| C. A development-only switch that turns the token check off                                                                                                           | Simple.                                                                                       | A switch that disables a security check can leak into a real run; the server package would gain it.                                                        |

Lean: **A**.

## 7. Small items

- **a. Check API answers at runtime.** The client parses each response with the server's own schema, so a mismatch fails loudly instead of showing wrong data. The schemas are already in the bundle. Lean: yes.
- **b. React lint rules.** Add `eslint-plugin-react-hooks` 7.1, which catches misuse of React hooks (a common source of stale data and infinite re-renders). Lean: yes.
- **c. Versions.** The newest releases at the time of the PR, exact pins, each past the repository's minimum release age. Today that means Vite 8.3.3, React 19.3.0, `@xyflow/react` 12.12.0, Zustand 5.0.15 and elkjs 0.12.0.
- **d. Default layout direction.** Edges run left to right unless a view asks otherwise, as in the research benchmark; `DOWN`, `LEFT` and `UP` are available. Lean: left to right.
