# Third-party licenses

Canvas is licensed under AGPL-3.0-or-later (see `LICENSE`). This file records the third-party components Canvas ships, with their licenses and notices.

For now it holds the components whose license needs a stated choice, such as a dual-licensed library and the option Canvas uses it under. The complete list of every bundled dependency, with the notices that MIT, Apache-2.0, BSD and similar licenses require to ship with a bundle, is added when Canvas is first packaged for `npx` (plan OPS-8).

Each entry uses this format:

```
## <package name> <exact version>

- License: <SPDX expression as published, e.g. EPL-2.0 OR GPL-3.0-or-later>
- Canvas uses it under: <the chosen option>
- Why: <reason, e.g. compatibility with AGPL-3.0>
- Source: <registry or repository URL>
- Used by: <Canvas package>
```

## elkjs 0.12.0

- License: EPL-2.0 OR GPL-3.0-or-later
- Canvas uses it under: GPL-3.0-or-later
- Why: compatibility with Canvas's AGPL-3.0-or-later license; GPL-3.0 section 13 allows a GPL-3.0 work to be combined with an AGPL-3.0 work (architecture section 12; stack research, risk 10).
- Source: https://www.npmjs.com/package/elkjs, https://github.com/kieler/elkjs
- Used by: `@canvas/web` (graph layout in a Web Worker)
