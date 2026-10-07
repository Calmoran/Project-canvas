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

Follow-up (issue #65, 2026-10-07): option A was measured. **Plain coloured boxes do not make the overview smooth at 1,000 or 1,500 cards**; see [Simplified cards below a zoom threshold](#simplified-cards-below-a-zoom-threshold-issue-65).

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

## Simplified cards below a zoom threshold (issue #65)

Date: 2026-10-07. Measured by worker-web, headless only. Raw results: `packages/web/spikes/react-flow-scale/results/2026-10-07-headless-web65.json`.

### Conclusion

**No: with plain coloured boxes, the overview is smooth at 500 cards but not at 1,000 or 1,500.** At 1,000 and 1,500 cards the boxes are no faster than full cards, at normal CPU speed and on the slowed CPU alike. The text, icons and badges were not what made the overview slow. Per the issue, this goes to the Architect before WEB-5.

- **500 cards: boxes help a lot.** Zooming in the overview goes from 63 to 114 frames per second at normal speed, and slow frames drop from 74% to 4 to 5%. On the slowed CPU it goes from 15 to 26 fps: better, still not smooth.
- **1,000 and 1,500 cards: no difference.** At 1,500, overview zoom is 41 fps with full cards and 39 to 40 with boxes; on the slowed CPU it is 4 fps either way. Pan is the same too (94 fps at normal speed, 24 to 28 slowed).
- **What is left is something else on screen.** In the overview every card and every edge is in the page: 1,500 card frames and 2,250 edge lines. The boxes removed only what was inside the cards. This spike did not measure which of the two remaining parts costs the time. The edges are the likely suspect, because there are more of them and each is a drawn line, but that is a guess until it is measured.
- **The two ways of switching perform the same.** "swap" (each card re-renders as a smaller element) and "css" (one style class hides the content) were within measurement noise of each other in every row. Either would do for WEB-5; the choice can be made on code grounds.

**Threshold recommendation: 0.5**, for Alex to decide. The measurements do not single out a value: from 0.3 to 0.8, how smooth the view is tracks how many cards and edges are on screen at that zoom, not the threshold itself. The recommendation is therefore based on readability. The card label is 13 px at zoom 1, so it is about 6.5 px at 0.5, 5 px at 0.4 and 8 px at 0.6. Below about 0.5 nobody can read it, so the boxes lose nothing there. 0.6 would also be defensible (8 px is borderline readable). Above 0.6, boxes would replace cards a user can still read.

### What was measured

The same page, graph, motions, window (1,600 x 900), 3 passes and medians as WEB-1, at normal CPU speed and with the 4x CPU throttle. Two new variants, both built on `visible-presized` (only cards on screen in the page, sizes declared):

- `boxes-swap`: each card reads the zoom from React Flow's store and, below the threshold, renders a plain box in its kind's colour. React re-renders each card on screen once when the threshold is crossed, and not otherwise.
- `boxes-css`: the card does not change. One small component puts a class on the flow's container below the threshold, and the stylesheet hides the icon, label and badges and colours the box. React re-renders nothing.

The boxes keep their two handles (the dots edges attach to), because React Flow reads their positions to draw the edges.

Two views:

- `overview`, as in WEB-1, at 500, 1,000 and 1,500 cards, with threshold 0.5. Every zoom this view reaches is below 0.5 (the fit zoom is 0.24 at most, doubled by the zoom motion to 0.48), so these runs show boxes the whole time. `visible-presized` with full cards was run again in the same session as the baseline.
- `edge`, at 1,500 cards, for thresholds 0.3, 0.4, 0.5, 0.6 and 0.8. The view starts just above the threshold (1.05 times it), centred on the graph. That puts on screen the most full cards the threshold ever allows. The zoom motion (half to double) then crosses the threshold in both directions.

### Results: overview

Headless; median of 3 passes. "Full cards" is `visible-presized`. Every card and edge is in the page in all these rows (500/750, 1,000/1,500 and 1,500/2,250).

| CPU | Cards | Variant    | Initial render | Pan fps | Pan slow frames | Zoom fps | Zoom slow frames |
| --- | ----- | ---------- | -------------- | ------- | --------------- | -------- | ---------------- |
| 1x  | 500   | full cards | 143 ms         | 107     | 10%             | 63       | 74%              |
| 1x  | 500   | boxes-swap | 100 ms         | 118     | 2%              | 114      | 4%               |
| 1x  | 500   | boxes-css  | 93 ms          | 117     | 2%              | 114      | 5%               |
| 1x  | 1,000 | full cards | 214 ms         | 103     | 10%             | 69       | 54%              |
| 1x  | 1,000 | boxes-swap | 208 ms         | 104     | 10%             | 67       | 54%              |
| 1x  | 1,000 | boxes-css  | 222 ms         | 102     | 9%              | 68       | 54%              |
| 1x  | 1,500 | full cards | 366 ms         | 94      | 10%             | 41       | 94%              |
| 1x  | 1,500 | boxes-swap | 334 ms         | 94      | 10%             | 39       | 96%              |
| 1x  | 1,500 | boxes-css  | 350 ms         | 94      | 10%             | 40       | 95%              |
| 4x  | 500   | full cards | 817 ms         | 61      | 19%             | 15       | 98%              |
| 4x  | 500   | boxes-swap | 554 ms         | 72      | 20%             | 26       | 99%              |
| 4x  | 500   | boxes-css  | 594 ms         | 70      | 20%             | 26       | 99%              |
| 4x  | 1,000 | full cards | 1279 ms        | 41      | 22%             | 8        | 96%              |
| 4x  | 1,000 | boxes-swap | 1159 ms        | 43      | 19%             | 8        | 96%              |
| 4x  | 1,000 | boxes-css  | 1266 ms        | 40      | 19%             | 8        | 96%              |
| 4x  | 1,500 | full cards | 2091 ms        | 26      | 19%             | 4        | 100%             |
| 4x  | 1,500 | boxes-swap | 1789 ms        | 28      | 19%             | 4        | 93%              |
| 4x  | 1,500 | boxes-css  | 1980 ms        | 24      | 22%             | 4        | 93%              |

### Results: just above each threshold, 1,500 cards

Pan is at full cards (the view starts above the threshold). Zoom crosses the threshold. Cards and edges are the counts in the page at the start.

| CPU | Threshold | Cards / edges in page | Pan fps (swap / css) | Zoom fps (swap / css) | Zoom p95 (swap / css) |
| --- | --------- | --------------------- | -------------------- | --------------------- | --------------------- |
| 1x  | 0.3       | 513 / 1696            | 66 / 55              | 55 / 43               | 50 / 58 ms            |
| 1x  | 0.4       | 315 / 1424            | 56 / 57              | 60 / 57               | 33 / 42 ms            |
| 1x  | 0.5       | 187 / 1188            | 59 / 60              | 29 / 29               | 333 / 358 ms          |
| 1x  | 0.6       | 117 / 1045            | 68 / 76              | 22 / 24               | 342 / 375 ms          |
| 1x  | 0.8       | 77 / 926              | 98 / 93              | 19 / 14               | 358 / 342 ms          |
| 4x  | 0.3       | 513 / 1696            | 4 / 3                | 6 / 4                 | 600 / 1333 ms         |
| 4x  | 0.4       | 315 / 1424            | 3 / 3                | 8 / 8                 | 358 / 517 ms          |
| 4x  | 0.5       | 187 / 1188            | 4 / 4                | 7 / 6                 | 467 / 500 ms          |
| 4x  | 0.6       | 117 / 1045            | 6 / 5                | 5 / 5                 | 542 / 609 ms          |
| 4x  | 0.8       | 77 / 926              | 10 / 10              | 6 / 5                 | 442 / 583 ms          |

What these show:

- Even with few cards on screen (77 at threshold 0.8), the slowed CPU pans at 10 fps. Far more edges than cards are in the page (926 against 77), which fits the suspicion above.
- From 0.5 upward, zooming has hitches of a third of a second or more (p95, the worst 1 frame in 20). Zooming in from above the threshold makes React Flow add and remove cards as they leave and enter the view. It is the same for both variants, so it is not the box switch.
- The synthetic graph makes this view pessimistic. Its cross edges join random cards anywhere on the grid, so most of them are long and pass through any view; that is why 926 to 1,696 edges are in the page. A real ELK layout (WEB-2) keeps connected cards close, so far fewer edges would cross a zoomed-in view. The overview has every edge on screen regardless, so this does not soften the overview result.

### How sure these numbers are

- **Not comparable with the WEB-1 tables.** Chrome updated itself between the runs (154.0.8037.93 to 154.0.8037.98), and headless Chrome now paces frames at 120 per second instead of 60. The same baseline, 1,500 full cards in the overview at normal speed, zoomed at 14 fps headless in WEB-1 and at 41 fps now. Compare rows within this section only; that is why the full-card baseline was run again in the same session.
- Swap and css differ by up to about 20% in single rows, in both directions, with no pattern. That is within the run-to-run noise WEB-1 found.
- The 4x throttle slows JavaScript only, not the graphics card (see WEB-1).

### Open for the Architect

- Whether to measure the remaining cost (for example the overview with edges hidden, or with fewer edges drawn) before choosing between options B, C and D, or a new option.
- The threshold value (recommended 0.5, above).

## Reproduce

```
pnpm install
pnpm --filter @canvas/web spike:rf:measure my-results.json 1,4
```

For the simplified-cards matrix (issue #65), add `--suite=web65`:

```
pnpm --filter @canvas/web spike:rf:measure my-results.json 1,4 --suite=web65
```

Either command builds the page, serves it locally, runs Chrome headless (it uses the installed Chrome; `playwright-core` downloads no browser), and writes the medians as JSON. `--quick` runs one short pass at 500 cards to check that it works. `pnpm --filter @canvas/web spike:rf` serves the page for a person to watch, with a "Run all" button.
