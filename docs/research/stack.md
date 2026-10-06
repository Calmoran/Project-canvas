# Canvas technology stack research

Date: 2026-10-06. Researcher: Claude (technology research pass). Scope: libraries and tools for a local web app (Node.js + TypeScript backend, React + React Flow frontend) that runs on Windows first, then macOS and Linux, on machines with no C++ compiler.

**How the facts were gathered.** Versions, release dates, licenses, dependencies and install scripts come from the npm registry (`npm view <pkg> version license time dependencies optionalDependencies peerDependencies scripts`, run 2026-10-06; registry page `https://www.npmjs.com/package/<pkg>`). Some claims were also tested on this Windows 11 machine with Node 24.16.0: install tests, a parser smoke test and a layout benchmark. Those are marked **[tested locally]**. Anything not confirmed from a primary source is marked **UNVERIFIED**. Note that this machine *does* have MSVC build tools, so "installs without a compiler" is inferred from package contents and install scripts, not from a compiler-free install.

**Node baseline.** Node 24 (Krypton) became LTS on 2025-10-28, moves to maintenance on 2026-10-20 and reaches end of life on 2028-04-30. Node 26 becomes LTS on 2026-10-28 and reaches end of life on 2029-04-30. Source: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json. Practical consequence: target `engines.node >= 24` and test on both 24 and 26.

Terms used below:
- **Native module**: a compiled C/C++ `.node` file that Node loads. It needs either a prebuilt binary for the user's OS and CPU, or a compiler at install time.
- **N-API**: Node's stable binary interface. A native module built against it keeps working across Node versions and Electron without a rebuild.
- **WASM (WebAssembly)**: portable compiled code that runs inside Node or the browser. One file works on every OS and nothing is compiled at install.

---

## 1. Graph canvas and layout

| Package | Current | Released | Major since | License | Native? | Maintenance |
|---|---|---|---|---|---|---|
| `@xyflow/react` | 12.12.0 | 2026-09-24 | 12.0.0, 2024-07-09 | MIT | Pure JS | Active (monthly releases) |
| `@dagrejs/dagre` | 3.1.1 | 2026-08-08 | 3.0.0, 2026-03-22 | MIT | Pure JS | Active (revived by the dagrejs org) |
| `elkjs` | 0.12.0 | 2026-07-17 | pre-1.0 | EPL-2.0 OR GPL-3.0-or-later | Pure JS (Java transpiled to JS), runs in a Web Worker | Active (Eclipse KIELER) |
| `d3-force` | 3.0.0 | 2021-06-05 | 3.0.0 | ISC | Pure JS | Stable and feature-complete; no releases since 2021 |

Sources: npm registry; https://github.com/xyflow/xyflow; https://github.com/dagrejs/dagre; https://github.com/kieler/elkjs; https://github.com/d3/d3-force.

- **React Flow license and Pro.** The library is MIT, "and it will be forever". Pro is a subscription that funds maintenance: Starter costs $169/month and includes Pro examples and templates, prioritised GitHub issues, one team invite and an intro call. Professional costs $289/month and adds up to one hour of email support per month and five invites. Enterprise is priced on request. Pro adds no library features; it sells examples and support. Source: https://reactflow.dev/pro.
- **Performance guidance.** The docs give **no numeric node-count limit**. Their advice: memoise custom nodes and edges (`React.memo`, `useCallback`), don't subscribe components to the whole `nodes` array, collapse large subtrees with the node `hidden` flag, and keep node CSS simple (no shadows, gradients or animations). Source: https://reactflow.dev/learn/advanced-use/performance. The `onlyRenderVisibleElements` prop exists in the API reference but the performance page doesn't mention it (https://reactflow.dev/api-reference/react-flow; UNVERIFIED that it helps at our scale).
- **Layout guidance from React Flow.** Dagre is described as "simple, fast", with an open issue about laying out sub-flows. d3-hierarchy only handles single-root trees with uniform node sizes. d3-force needs care, because running the force layout on every render is expensive. ELK is the most configurable, has the largest bundle and a steep learning curve. Source: https://reactflow.dev/learn/layouting/layouting.
- **[tested locally] Layout benchmark.** Setup: synthetic DAG made of a random tree plus 0.5×n random cross edges, nodes 180×40, left-to-right layout, Node 24.16, one run each:

| Nodes / edges | dagre 3.1.1 (default network-simplex) | dagre (`ranker: 'longest-path'`) | elkjs 0.12 `layered` | d3-force (300 ticks) |
|---|---|---|---|---|
| 1000 / 1241 | 7.5 s | 2.0 s | 1.5 s | 1.3 s |
| 2000 / 2530 | 49.3 s | 8.5 s | 4.2 s | 2.9 s |
| 3000 / 3790 | 151 s | not run | 8.2 s | 5.1 s |

- **Verdict for 1,000–3,000 nodes in a hierarchical layout: elkjs `layered`, run in a Web Worker** so the UI never freezes. It scales far better than dagre once the graph has cross edges. It also supports ports, compound or nested nodes (useful for grouping by module or table) and orthogonal edge routing. d3-force isn't hierarchical. Dagre is only acceptable below roughly 500 nodes. The ELK license is compatible with AGPL-3.0 through its GPL-3.0-or-later option (GPLv3 §13 allows combining with AGPLv3). Even at 3k nodes the expected UX is to lay out a filtered or collapsed subgraph on demand, not the whole graph at once.

## 2. SQLite from Node

| Option | Current | Released | License | Native? | Notes |
|---|---|---|---|---|---|
| `better-sqlite3` | 13.0.3 | 2026-08-05 (13.0.0 on 2026-07-21) | MIT | Native, **N-API, with prebuilt binaries inside the package** for win32-x64/arm64, darwin-x64/arm64, linux(+musl)-x64/arm64; no install script | Synchronous API, fastest, mature |
| `node:sqlite` (built in) | ships with Node | in Node 22.5+ | MIT (Node) | Nothing to install | Stability 1.2 "Release candidate" since Node v24.15.0 (and v25.7.0); not yet "Stable" in v26.10 |
| `sql.js` | 1.14.2 | 2026-08-14 | MIT | WASM | Database lives in memory; you must export the whole file to persist it. Slower |
| `libsql` | 0.5.29 | 2026-03-25 | MIT | Native (Rust), per-platform prebuilt optional dependencies including `@libsql/win32-x64-msvc` | Fork of SQLite (Turso) with a better-sqlite3-compatible API; pre-1.0 |

Sources: npm registry; https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0 (moved to N-API and ships prebuilt binaries in the package instead of `prebuild-install`; aimed at running across Node versions and Electron); https://nodejs.org/docs/latest-v24.x/api/sqlite.html (Stability 1.2 Release candidate; "v24.15.0: SQLite is now a release candidate"; the flag was removed in v23.4.0/v22.13.0); https://nodejs.org/api/sqlite.html (v26.10.0, still 1.2); https://github.com/sql-js/sql.js; https://github.com/tursodatabase/libsql-js.

- **[tested locally]** `npm i better-sqlite3` on Windows/Node 24.16 used `prebuilds/win32-x64.node` and opened a database (SQLite 3.53.4). `node:sqlite` `DatabaseSync` also worked with no flag (SQLite 3.53.0).
- **Recommendation: `better-sqlite3` 13.** The move to N-API removes the classic "binary doesn't match your Node version" install failure. It is also the best-documented option and works with ORMs and query builders (drizzle-orm, kysely). Hide it behind a small storage interface so `node:sqlite` can replace it once that module is marked Stable. At that point the dependency becomes zero-install, which also simplifies single-executable packaging (§10). Reject `sql.js`: it holds the whole database in memory and is slow to persist. Reject `libsql`: it's pre-1.0, its extras (Turso sync) aren't needed, and it diverges from upstream SQLite.

## 3. MySQL client

| Package | Current | Released | License | Native? |
|---|---|---|---|---|
| `mysql2` | 3.24.5 | 2026-09-29 (major 3 since 2023-01-12) | MIT | **Pure JS** |

- "MySQL2 is free from native bindings and can be installed on Linux, Mac OS or Windows without any issues." It has a Promise API, prepared statements, row streaming and bundled TypeScript types. Source: https://sidorares.github.io/node-mysql2/docs.
- **[tested locally, source inspection]** The installed package bundles auth plugins `caching_sha2_password` (the MySQL 8 default), `sha256_password`, `mysql_native_password` and `mysql_clear_password` (`lib/auth_plugins/`), and `caching_sha2_password` is wired into `auth_switch.js`. The `authPlugins` option allows custom plugins. Source: https://sidorares.github.io/node-mysql2/docs/documentation/authentication-switch.
- **MariaDB.** It works with MariaDB's default `mysql_native_password` (widely used against MariaDB; it's the same wire protocol). There is **no built-in MariaDB `client_ed25519` plugin**: no such file exists in `lib/auth_plugins`. A user whose MariaDB account uses ed25519 would need a custom `authPlugins` entry (UNVERIFIED: no maintained npm package for this was found). Low risk for AzerothCore installs, which usually use native password or caching_sha2 accounts.
- Trade-off: it's the de facto standard and pure JS, with no real competitor. The alternative `mariadb` connector is MariaDB-focused.

## 4. SSH tunnel

| Option | Current | Released | License | Native? | Trade-off |
|---|---|---|---|---|---|
| `ssh2` | 1.17.0 | 2025-08-20 (major 1 since 2021) | MIT (UNVERIFIED in registry metadata; the repo LICENSE is MIT) | Pure JS core. Optional native crypto binding plus optional `cpu-features` | In-process: full control over keys, agent, host-key checks and error reporting |
| `tunnel-ssh` | 5.2.0 | 2024-12-15 | MIT | Wraps `ssh2` | Thin convenience layer, slow-moving; not worth the extra dependency |
| System `ssh -N -L` | OS-provided | n/a | n/a | None | Uses the user's `~/.ssh/config`, agent and known_hosts. Harder to report errors cleanly and to prompt for passwords or passphrases without a terminal |

- **Windows without a compiler.** `ssh2` is "written entirely in JavaScript". `cpu-features` is an optional dependency that only tunes cipher selection, and "the library functions without it" (https://github.com/mscdex/ssh2). Its `install.js` runs `node-gyp rebuild` for the optional crypto binding, and **if that fails it only prints "Failed to build optional crypto binding" and exits 0**. npm drops failed optional dependencies, so the install doesn't break. **[tested locally]** On this machine `cpu-features` wasn't present after install, and npm still completed successfully. Under pnpm 10+, dependency build scripts are blocked by default (§9), so the pure-JS path is what users get anyway.
- `ssh2` supports local port forwarding (`forwardOut`), RSA/ECDSA/Ed25519 keys, and on Windows the Pageant and OpenSSH agent named pipe (same source).
- **System OpenSSH on Windows.** Microsoft's in-box OpenSSH needs Windows 10 build 1809 or later, or Windows Server 2019+ (https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse). The page tells users to check Optional Features, so "installed by default on every Windows 10/11" is **UNVERIFIED**. It is present on this machine (`C:\Windows\System32\OpenSSH` is on PATH).
- **Recommendation:** use `ssh2` as the primary path. Offer "use my system `ssh` / existing tunnel" as an advanced fallback, and also allow a direct connection with no SSH at all.

## 5. Git from Node

| Package | Current | Released | License | Native? | Trade-off |
|---|---|---|---|---|---|
| `simple-git` | 4.0.2 | 2026-09-26 (4.0.0 on 2026-09-25) | MIT | Pure JS wrapper that **shells out to an installed `git`** | Real git speed and exact git semantics (diffs, rename detection, packfiles); needs git on PATH |
| `isomorphic-git` | 1.43.1 | 2026-10-06 | MIT | Pure JS reimplementation | No git install needed. Slow on large repos, no protocol v2, no built-in text-diff engine (UNVERIFIED as a documented limitation; its API exposes `walk` over trees and you build diffs yourself) |

Sources: npm registry; https://github.com/steveukx/git-js/releases. 4.0 breaking changes: no default export (`import { simpleGit }`), abbreviated long options rejected, ambient environment variables filtered unless allowed via config, deprecated APIs removed. Also https://isomorphic-git.org/docs/en/faq.

- **Recommendation: `simple-git`,** or a thin wrapper around `child_process.spawn('git', …)`. A branch-to-branch diff of the AzerothCore C++ tree (`git diff --name-status A...B`, `git diff -M`) is exactly what native git is optimised for. A JS reimplementation would be much slower and would have to reimplement rename detection. Users already have a git clone, so git is very likely installed. **Caveat:** GitHub Desktop users may have git only inside GitHub Desktop and not on PATH. Detect this at startup, show a clear message, and support a configurable git path.

## 6. C++ and Lua parsing (tree-sitter)

| Package | Current | Released | License | Ships | Native? |
|---|---|---|---|---|---|
| `web-tree-sitter` | 0.27.0 | 2026-08-30 | MIT | `web-tree-sitter.wasm` (+ debug build) | **WASM** |
| `tree-sitter-cpp` | 0.23.4 | 2024-11-11 | MIT | **`tree-sitter-cpp.wasm` in the package root** + N-API prebuilds (win32-x64/arm64, darwin, linux) | WASM file usable directly |
| `@tree-sitter-grammars/tree-sitter-lua` | 0.4.1 | 2025-12-31 | MIT | **`tree-sitter-lua.wasm`** + prebuilds | WASM file usable directly |
| `tree-sitter` (node binding) | 0.25.1 | 2026-07-28 | MIT | N-API, `node-gyp-build` with prebuilds | Native |
| `tree-sitter-wasms` | 0.1.13 | 2025-10-07 | Unlicense | Third-party bundle of ~36 grammar `.wasm` files | WASM; versions lag upstream |
| `tree-sitter-lua` (unscoped) | 2.1.3 | 2022-08-14 | MIT | Old, unmaintained | **Avoid**; use `@tree-sitter-grammars/tree-sitter-lua` |

Sources: npm registry (package file listings via `npm pack --dry-run`); https://github.com/tree-sitter/tree-sitter (web binding lives in `lib/binding_web`); https://github.com/tree-sitter/tree-sitter-cpp; https://github.com/tree-sitter-grammars/tree-sitter-lua.

- **No emscripten build is needed.** Prebuilt `.wasm` grammars are published inside the official grammar npm packages.
- **[tested locally]** `web-tree-sitter` 0.27 loaded `tree-sitter-cpp.wasm` (ABI 14) and `tree-sitter-lua.wasm` (ABI 15), and parsed `class Foo : public ScriptObject { void OnLogin(Player* p) override {} };` and `RegisterPlayerEvent(3, function(e,p) end)` into correct syntax trees on Windows, Node 24. This is a pure WASM path, so no compiler is involved.
- **Packaging caveat.** The grammar packages also declare an `install: node-gyp-build` script and a peer dependency on the native `tree-sitter`. To keep the install clean, either depend on them but only read the `.wasm` file (pnpm blocks the script anyway), or **vendor the two `.wasm` files** into `packages/core` with a script that copies and pins them. Vendoring is better for reproducibility.
- **Native `tree-sitter` binding** is the alternative: roughly 1.5–3× faster parsing (UNVERIFIED for this codebase). It now ships N-API prebuilds, so Windows without a compiler probably works on x64/arm64. Its peer ranges lag (`tree-sitter-cpp` declares peer `tree-sitter ^0.21.1`), and native modules complicate single-executable and desktop packaging. WASM speed is adequate for a one-off scan of AzerothCore (a few thousand files), and the scan can run in `worker_threads`.
- Note: `tree-sitter-cpp` hasn't been released since 2024-11. It still works, but C++20/23 coverage gaps won't be fixed quickly.

## 7. Backend HTTP framework

| Framework | Current | Released | Major since | License | TypeScript | Progress streaming |
|---|---|---|---|---|---|---|
| **Fastify** | 5.12.5 | 2026-09-16 | 5.0.0, 2024-09-17 | MIT | Typed routes via "type providers"; `fastify-type-provider-zod` 7.0.0 (peers fastify ^5.5, zod ≥4.1.5) turns zod schemas into validation, types and OpenAPI | Official `@fastify/sse` 0.6.0 (2026-07-27, peer fastify ^5; pre-1.0); official `@fastify/websocket` 11.3.3 |
| **Hono** | 4.13.13 | 2026-10-04 | 4.0.0, 2024-02-09 | MIT | Excellent; typed RPC client (`hc`) shares route types with the frontend | Built-in `streamSSE()` helper (https://hono.dev/docs/helpers/streaming); Node needs `@hono/node-server` 2.1.3. `@hono/node-ws` 1.3.1 still declares peer `@hono/node-server ^1.19.11`, which mismatches 2.x |
| **Express 5** | 5.2.1 | 2025-12-01 | 5.0.0, 2024-09-10 | MIT | Community `@types/express`; no built-in schema typing | SSE by hand with `res.write`; WebSocket via `ws` 8.22.0 |

Sources: npm registry; https://github.com/fastify/sse; https://hono.dev/docs/helpers/streaming; https://expressjs.com.

- All three are pure JS.
- **Recommendation: Fastify 5.** It has schema-first validation and serialisation, a mature plugin system (`@fastify/static` for serving the built SPA, sse, websocket), and the best structure for a long-lived local server. Hono is a close second and better if we want a typed RPC client and runtime portability. For one-way scan progress, **SSE (server-sent events) is enough and simpler than WebSocket**. SSE is a plain HTTP response that stays open and streams events; the browser reconnects automatically.

## 8. Frontend build

| Package | Current | Released | Major since | License | Notes |
|---|---|---|---|---|---|
| `vite` | 8.3.3 | 2026-10-06 | 8.0.0, 2026-03-12 | MIT | Uses Rolldown (Rust bundler) for both dev and build; Node 20.19+/22.12+; native binaries ship as prebuilt npm packages |
| `@vitejs/plugin-react` | 6.1.2 | 2026-10-05 | n/a | MIT | peer vite ^8 |
| `react` / `react-dom` | 19.3.0 | 2026-09-09 | 19.0.0, 2024-12-05 | MIT | |
| `typescript` | 7.0.2 (`latest`); 6.0.3 is the last JS-based release | 7.0.2: 2026-07-08 | n/a | Apache-2.0 | 7.0 is the Go native port, about 10× faster, and **ships no programmatic API** (expected in 7.1) |

Sources: npm registry; https://vite.dev/blog/announcing-vite8; https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/. That post says: "TypeScript 7.0 does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API." It recommends aliasing `typescript` to `npm:@typescript/typescript6` for tools such as typescript-eslint, and installing 7 as `@typescript/native`.

- **React 19 + React Flow.** `@xyflow/react` 12 declares peer `react >=17`. React Flow's UI components were updated for React 19 and Tailwind 4 (https://reactflow.dev/whats-new/2025-10-28). No incompatibility is known.
- **TypeScript choice:** use TS 6.0.x as `typescript` (required by typescript-eslint, §11) and add TS 7 (`tsgo`) for fast `--noEmit` type checks. Collapse to one version when 7.1 ships its API.

## 9. Monorepo tooling

| Option | Current | License | Trade-off |
|---|---|---|---|
| pnpm workspaces | pnpm 12.9.1 (12.0.0 on 2026-08-26; 11.x still maintained) | MIT | Strict `node_modules` (catches missing dependencies), fast, `workspace:*` protocol, `pnpm --filter`. **Since v10, dependency lifecycle scripts are blocked by default** and allowed per package (`onlyBuiltDependencies`), a good supply-chain default (https://github.com/pnpm/pnpm/releases/tag/v10.0.0). Contributors need pnpm, via `corepack` or install |
| npm workspaces | npm 11.13 (with Node 24) | Artistic-2.0 | Zero extra tooling. Hoisting hides missing dependencies; weaker filtering |
| Turborepo | `turbo` 2.11.7 | MIT | Task caching and ordering across packages. Overkill for five packages at the start; add later if CI gets slow |

- **Recommendation: pnpm workspaces, no Turborepo yet.** Use `pnpm -r --filter` and TypeScript project references for build order. End users never see pnpm; it is only for contributors.

## 10. Packaging for end users

| Option | Status (2026-10) | Native modules | Realism |
|---|---|---|---|
| (a) Node + `npx canvas` (or a global install) | Works today | better-sqlite3 prebuilds, WASM tree-sitter, pure-JS mysql2/ssh2: no compiler needed | **First release.** The user installs Node 24/26 LTS once |
| (b) Node SEA (single executable) | Stability 1.1 "Active development". Node 24 still needs `--experimental-sea-config` + `postject`; **Node 25.5+ (so Node 26 LTS) adds built-in `--build-sea`**; ESM entry supported in 26 | Must be bundled into one script. Native `.node` files go in as assets, are written to a temp dir and loaded with `process.dlopen()`; `.wasm` files go in as assets | Later. Clean once on Node 26, especially if `node:sqlite` replaces better-sqlite3 (no native module left) |
| (c) `@yao-pkg/pkg` | 6.23.0 (2026-09-29), MIT, maintained fork of archived `vercel/pkg`; needs Node ≥22 | Supports `.node` addons, ESM, and a `--sea` mode | Later; a viable fallback to (b) |
| (d) Electron | 44.5.1 (2026-09-30); Electron 44.0.0 bundles Node v24.18.1 and Chromium 152 (https://releases.electronjs.org/release/v44.0.0); `electron-builder` 26.15.3, `@electron-forge/cli` 8.0.1 | N-API better-sqlite3 13 loads without a rebuild (the v13 notes target Electron; UNVERIFIED in practice) | **Most realistic desktop wrapper.** The backend runs in-process; ~100 MB+ installers |
| (e) Tauri v2 + Node sidecar | `@tauri-apps/cli` 2.12.1 (2026-09-30), MIT/Apache-2.0; official guide packages Node as a binary (uses pkg) and registers it under `bundle.externalBin` (https://v2.tauri.app/learn/sidecar-nodejs/) | The sidecar binary is still made with (b) or (c) | Smaller UI shell, but adds a Rust toolchain and two-process plumbing; system WebView differences on Windows/macOS/Linux. Later option only |

Sources: https://nodejs.org/docs/latest-v24.x/api/single-executable-applications.html; https://nodejs.org/api/single-executable-applications.html (v26.10: `--build-sea` added v25.5.0); https://github.com/yao-pkg/pkg; npm registry.

- **Recommendation:** release 1 is a Node package run with `npx`, opening the browser to `localhost`. Release 2 is either a SEA build on Node 26 or Electron, decided by whether a native window and OS integration are wanted. Keep the server free of Electron-specific code so both stay possible. Code signing (Windows SmartScreen, macOS notarisation) is needed for any downloadable binary.

## 11. Testing, linting, validation

| Package | Current | Released | License | Notes |
|---|---|---|---|---|
| `vitest` | 5.0.3 | 2026-09-30 (5.0.0 on 2026-09-03) | MIT | Node ^22.12 / ^24 / ≥26; shares Vite config; workspace projects |
| `@playwright/test` | 1.63.0 | 2026-09-04 | Apache-2.0 | End-to-end tests of the SPA; downloads browser binaries (no compiler) |
| `eslint` | 10.12.0 | 2026-10-02 (10.0.0 on 2026-02-06) | MIT | Flat config only |
| `typescript-eslint` | 8.71.1 | 2026-10-05 | MIT | peer `typescript >=4.8.4 <6.1.0`, so **no TS 7 support yet** (https://typescript-eslint.io/users/dependency-versions/) |
| `@biomejs/biome` | 2.5.15 | 2026-09-30 (2.0.0 in 2025-06) | MIT OR Apache-2.0 | Rust binary via per-platform npm packages; lint + format; v2.5 claims about 500 rules (https://biomejs.dev/blog/) |
| `oxlint` | 1.87.0 | 2026-10-05 | MIT | Type-aware rules via `oxlint-tsgolint`, built on TS 7 (emerging alternative) |
| `zod` | 4.6.5 | 2026-09-13 (4.0.0 on 2025-07-09) | MIT | Pure JS |

- **Recommendation:** Vitest for unit and integration tests, Playwright for end-to-end tests. For linting, ESLint 10 flat config + `typescript-eslint` `recommendedTypeChecked`. Type-aware rules (`no-floating-promises`, `no-misused-promises`) catch real bugs in async scan and DB code, and Biome's type-aware coverage is narrower (UNVERIFIED parity). Use Prettier or Biome as the formatter only; either is fine.
- **Zod 4** handles config and profile files, API request and response schemas (via the Fastify type provider), and the shape of the graph JSON sent to the web app.

## 12. Frontend state management

| Package | Current | Released | License | Model |
|---|---|---|---|---|
| `zustand` | 5.0.15 | 2026-08-13 (5.0.0 on 2024-10-14) | MIT | One store, selector subscriptions |
| `jotai` | 3.0.1 | 2026-09-29 (3.0.0 on 2026-09-08) | MIT | Many small atoms; brand-new major |
| React context | built in | n/a | MIT | Every consumer re-renders when the value changes |

- **React Flow uses Zustand internally.** `@xyflow/react` depends on `zustand ^4.4.0` (npm registry dependencies), and its docs recommend Zustand for app state alongside the flow (https://reactflow.dev/learn/advanced-use/state-management).
- **Recommendation: Zustand 5** for graph, selection, filter and scan-progress state. It handles thousands of nodes with fine-grained selectors, matches React Flow's own model, and context re-renders would hurt at this scale. Use TanStack Query for server data if caching or refetching grows (not researched here).

---

## Recommended stack

- **Language and repo:** a TypeScript monorepo on **pnpm workspaces**. TypeScript 6.0 is the `typescript` package for tooling, with TS 7 `tsgo` added for fast type checks.
- **Runtime:** Node `>=24`, tested on 24 and 26 LTS.
- **Backend:** **Fastify 5** with `@fastify/sse` for scan progress, `@fastify/static` for the SPA, and **Zod 4** schemas through `fastify-type-provider-zod`.
- **Database and SSH:** **mysql2** over an **ssh2** tunnel, with a system-ssh or direct-connection fallback.
- **Code and graph storage:** **simple-git** against the user's installed git. **web-tree-sitter** with vendored `tree-sitter-cpp.wasm` and `tree-sitter-lua.wasm`, running in `worker_threads`. **better-sqlite3 13** behind a storage interface, ready to swap to `node:sqlite` when it goes Stable.
- **Frontend:** **Vite 8 + React 19 + @xyflow/react 12**, with **elkjs `layered` in a Web Worker** for layout and **Zustand 5** for state.
- **Quality:** **Vitest 5** and **Playwright**, with ESLint 10 + typescript-eslint for type-aware linting.
- **Shipping:** release 1 is an **npx-launched local server** that opens the browser. Later releases choose between a **Node 26 SEA** and **Electron**; Tauri is deferred.

Nothing in this stack needs a C++ compiler on Windows. The only native pieces (better-sqlite3, and optionally ssh2's crypto binding) ship prebuilt binaries or degrade gracefully.

## Risks

1. **typescript-eslint vs TypeScript 7.** typescript-eslint caps at TS <6.1, and TS 7.0 has no API. Mitigation: run the two-version alias setup until TS 7.1. Risk of churn when 7.1's "new (and different)" API lands.
2. **Layout cost at 3k nodes.** Even ELK takes about 8 s for 3k nodes (single run, synthetic graph). The UX must lay out filtered or collapsed subgraphs, cache positions in SQLite, and never block the main thread. React Flow publishes no node-count guarantee, so render performance at 1–3k custom nodes must be prototyped early.
3. **tree-sitter-cpp staleness.** Last release 2024-11 (ABI 14). Parse errors on newer C++ constructs, or macro-heavy AzerothCore code, can drop edges, so the extractor must tolerate `ERROR` nodes. Grammar wasm/runtime ABI compatibility must be pinned and tested on each `web-tree-sitter` upgrade.
4. **git not on PATH** for GitHub Desktop-only users. Needs detection, a configurable path, or an isomorphic-git fallback for basic reads.
5. **`node:sqlite` still release candidate** in Node 24 and 26. Its API could change before Stable, so keep it behind the interface.
6. **SEA maturity.** Stability 1.1, and `--build-sea` is only in Node 25.5+. Native addons need temp-file extraction (antivirus friction on Windows). Unsigned binaries trigger SmartScreen and Gatekeeper.
7. **MariaDB ed25519 accounts** aren't supported out of the box by mysql2.
8. **SSH UX.** Passphrase-protected keys without an agent, host-key verification prompts and Windows agent pipes all need careful UI. ssh2 1.17.0 dates from 2025-08 (slow cadence, single maintainer; UNVERIFIED bus factor).
9. **Fresh majors.** Vitest 5, Jotai 3, pnpm 12, simple-git 4 and better-sqlite3 13 all released in the last three months. Expect early patch churn, so pin exact versions and use a lockfile.
10. **ELK license.** EPL-2.0 OR GPL-3.0-or-later. Choose and record the GPL-3.0-or-later option to stay AGPL-compatible, and note it in third-party notices.
