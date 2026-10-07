# React Flow at 1,500 card nodes (WEB-1, issue #24)

Date: 2026-10-06. Measured by worker-web. Spike code: `packages/web/spikes/react-flow-scale/`. Raw results: `packages/web/spikes/react-flow-scale/results/`.

## Conclusion

**Card nodes are fine at the 1,500 budget while the user works at a readable zoom. They are not fine when all 1,500 are on screen at once (the zoomed-out overview), so the node design must change for that case.** Per the issue, this goes to the Architect before WEB-5.

- At reading zoom (cards full size, about 50 on screen), with React Flow's `onlyRenderVisibleElements` switched on, 1,500 cards pan at the screen's full rate on this PC (120 frames per second). With the CPU slowed to a quarter, standing in for a weaker laptop, they pan at about 30 to 45 frames per second.
- Fully zoomed out, every card is on screen at about 14% of its size: 1,500 cards are about 28 x 9 pixels each, too small to read. There, panning drops to 36 to 88 frames per second on this PC and 5 to 14 on the slowed CPU. Zooming drops to 16 to 20 on this PC and 2 to 5 on the slowed CPU, which is unusable.
- Two settings are worth adopting regardless of what the Architect decides:
  1. `onlyRenderVisibleElements` on. It keeps only the cards on screen in the page and takes the reading-zoom case from 45 to 120 frames per second at 1,500 cards.
  2. Pre-sized cards. Canvas cards have a fixed size, so each node can declare its width, height and handle positions (a handle is the dot an edge attaches to). Without that, React Flow draws every card once just to measure it, even with `onlyRenderVisibleElements`. Declaring the sizes cuts the first draw of 1,500 cards at reading zoom from 0.24 s to 0.04 s, and from 1.5 s to 0.25 s on the slowed CPU.

Options for the zoomed-out case (for the Architect and Alex; none measured here yet):

- **A. A simpler form below a zoom threshold.** Under a chosen zoom, draw each card as a plain coloured box with no text, icon or badges. The cards can't be read at that size anyway. This needs its own measurement.
- **B. Never open on "fit everything" above a smaller number.** Above a node count to be measured (500 is borderline on a slowed CPU), open the explorer at reading zoom around the focus node and let the minimap show the whole graph.
- **C. Lower the visible-node budget.** This also shortens the layout time, but shows less of the graph.
- **D. Accept it.** The overview is a momentary view, and the stutter only happens while moving at that zoom.

## Terms

- **Frame rate (fps)**: how many times per second the screen picture updates. 60 looks smooth on an ordinary monitor; this PC's monitor can show 120. Below about 30, movement visibly stutters.
- **p95 frame time**: the worst 1 frame in 20, in milliseconds. 8.3 ms is one frame at 120 Hz, 16.7 ms one frame at 60 Hz.
- **Slow frames**: the share of frames that took longer than 1.5 screen refreshes, which is a visible hitch.
- **Initial render**: the time from handing React Flow the graph to cards and edges being on screen and no longer changing.
- **Freeze**: the longest single frame during the initial render. The page does not respond during it.

## What was measured

A synthetic graph with 500, 1,000 and 1,500 cards on a grid and 1.5 edges per card (a random tree plus random cross edges, the same graph every run). Each card is memoised (`React.memo`, so React skips redrawing a card whose data did not change) and has a kind icon, a label, two badges, and one handle on each side. The styling is flat, with no shadows, gradients or animations, as React Flow's performance guide asks.

Each combination of these settings was measured:

- Variant: `all` (React Flow's default); `visible` (`onlyRenderVisibleElements`); `visible-presized` (the same, plus declared card sizes and handle positions).
- View: `overview` (zoomed out to fit every card; zoom 0.24 at 500, 0.17 at 1,000, 0.14 at 1,500) or `work` (zoom 1, readable).

For each combination: initial render, then 3 s of fast panning (a circle of 800 px radius, about 2,500 px per second), then 3 s of zooming between half and double the starting zoom. The browser window was 1,600 x 900. Every combination ran 3 times; the tables show the median. All of it ran at normal CPU speed and again with Chrome's CPU throttle at 4x (JavaScript runs four times slower).

Machine: AMD Ryzen 9 3900X (12 cores), 32 GB RAM, NVIDIA GeForce RTX 4070 Ti SUPER, Windows 11 Home, monitor 3440 x 1440 at 120 Hz, Chrome 154.0.8037.93, production build of the page (React 19.3.0, `@xyflow/react` 12.12.0; built with Vite 8.3.3. The pull request pins Vite 8.3.2 because 8.3.3 is younger than the repository's minimum release age. Vite is the build tool and does not run in the page.)

## Results, 1,500 cards

On screen (headed Chrome, a visible window, 120 Hz). The first run opened a window on Alex's screen before the headless rule; Alex let it finish.

| CPU | Variant          | View     | Initial render | Freeze  | Cards / edges in page | Pan fps | Pan slow frames | Zoom fps | Zoom slow frames |
| --- | ---------------- | -------- | -------------- | ------- | --------------------- | ------- | --------------- | -------- | ---------------- |
| 1x  | all              | work     | 490 ms         | 325 ms  | 1500 / 2250           | 45      | 99%             | 29       | 99%              |
| 1x  | visible          | work     | 238 ms         | 133 ms  | 48 / 307              | 120     | 0%              | 56       | 35%              |
| 1x  | visible-presized | work     | 35 ms          | 33 ms   | 48 / 307              | 120     | 0%              | 57       | 34%              |
| 1x  | all              | overview | 493 ms         | 333 ms  | 1500 / 2250           | 36      | 99%             | 20       | 98%              |
| 1x  | visible          | overview | 471 ms         | 333 ms  | 1500 / 2250           | 87      | 7%              | 16       | 96%              |
| 1x  | visible-presized | overview | 481 ms         | 475 ms  | 1500 / 2250           | 88      | 7%              | 17       | 98%              |
| 4x  | all              | work     | 2960 ms        | 1883 ms | 1500 / 2250           | 6       | 100%            | 5        | 100%             |
| 4x  | visible          | work     | 1475 ms        | 933 ms  | 48 / 307              | 30      | 100%            | 18       | 100%             |
| 4x  | visible-presized | work     | 245 ms         | 217 ms  | 48 / 307              | 28      | 100%            | 18       | 100%             |
| 4x  | all              | overview | 3240 ms        | 1983 ms | 1500 / 2250           | 5       | 100%            | 5        | 100%             |
| 4x  | visible          | overview | 3070 ms        | 2033 ms | 1500 / 2250           | 14      | 100%            | 2        | 100%             |
| 4x  | visible-presized | overview | 2716 ms        | 2683 ms | 1500 / 2250           | 10      | 100%            | 2        | 100%             |

How it scales with node count (on screen, `visible-presized`; pan fps / zoom fps):

| CPU | View     | 500      | 1,000    | 1,500    |
| --- | -------- | -------- | -------- | -------- |
| 1x  | work     | 120 / 58 | 120 / 59 | 120 / 57 |
| 1x  | overview | 103 / 63 | 95 / 27  | 88 / 17  |
| 4x  | work     | 37 / 23  | 31 / 20  | 28 / 18  |
| 4x  | overview | 31 / 11  | 18 / 4   | 10 / 2   |

At reading zoom the card count hardly matters once `onlyRenderVisibleElements` is on: only the roughly 50 cards on screen are in the page. In the overview every card is on screen, so the cost grows with the count.

Zoom tops out near 60 fps even at 500 cards on this 120 Hz screen. While zooming, the browser redraws the text and shapes of every card on screen at the new size each frame; panning only slides an already-drawn picture.

## Headless versus on screen

From now on these runs are headless (no window; rule from Alex, 2026-10-06), so the same benchmark was also run headless (`results/2026-10-06-headless.json`). Headless Chrome has no monitor and paces frames at 60 per second, so it cannot show anything above 60 fps.

- Initial render and freeze times match within about 10% at 1x. At 4x headless is 10 to 40% slower.
- Frame rates cap at 60. At reading zoom with `onlyRenderVisibleElements`, 1,500 cards pan at the cap (60) headless; on screen that was 120. In the overview with `onlyRenderVisibleElements`, headless pans at 44 to 45 fps and zooms at 14.
- **Effect on the conclusion: none.** The pattern is the same: reading zoom is smooth, the full overview is not, and the slowed CPU makes the overview unusable. Headless hides differences above 60 fps, so a future comparison between options A to D should look at render time, slow frames and the slowed-CPU numbers, not at fps near 60.

## How sure these numbers are

- **Variance.** Two on-screen runs (the first discarded for the overview bug below) agreed within about 10% at 1x. At 4x they differed by up to about 30%: pan at reading zoom was 42 to 58 fps in one run and 28 to 44 in the other. Treat the 4x numbers as a range, not a point.
- **Discarded run.** The first run used React Flow's `fitView` for the overview. `fitView` waits until every node is measured, and the `visible-presized` variant never measures off-screen nodes, so that variant's overview silently stayed zoomed in. The page now computes the fit itself (`fitViewport` in `graph.ts`, with a unit test) for every variant. Only the second run is reported.
- **The 4x throttle is a proxy.** It slows JavaScript only, not the graphics card. A real weaker laptop with integrated graphics may do worse on zoom, which is mostly drawing work.
- **Synthetic graph, grid layout.** Real layouts (ELK, WEB-2) cluster cards and make edges shorter. That is unlikely to change the counts on screen, which drive these numbers.

## Reproduce

```
pnpm install
pnpm --filter @canvas/web spike:rf:measure my-results.json 1,4
```

This builds the page, serves it locally, runs Chrome headless (it uses the installed Chrome; `playwright-core` downloads no browser), and writes the medians as JSON. `--quick` runs one short pass at 500 cards to check that it works. `pnpm --filter @canvas/web spike:rf` serves the page for a person to watch, with a "Run all" button.
