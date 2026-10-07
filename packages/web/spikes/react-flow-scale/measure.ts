/**
 * Runs the whole spike measurement from the command line, headless:
 * builds the page, serves it locally, opens it in the installed Chrome without
 * a window, runs every configuration at each CPU throttle, and writes the
 * results as JSON.
 *
 *   pnpm --filter @canvas/web spike:rf:measure [out.json] [throttles]
 *   e.g. spike:rf:measure results/my-pc.json 1,4
 *
 * Add `--quick` (500 nodes, one short pass) to check the pipeline works.
 * Add `--suite=web65` for the simplified-cards matrix (issue #65); the
 * default `web1` is the WEB-1 matrix (issue #24).
 *
 * CPU throttle 4 makes Chrome run JavaScript four times slower, a stand-in
 * for a weaker laptop. `playwright-core` drives the browser; it downloads no
 * browser of its own and uses the Chrome already installed (`channel`).
 *
 * Headless Chrome has no screen, so it paces frames at 60 per second whatever
 * the monitor can do; frame rates above 60 cannot show up here.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { build, preview } from "vite";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const quick = process.argv.includes("--quick");
const suiteFlag = process.argv.find((a) => a.startsWith("--suite="));
const suiteName = suiteFlag?.slice("--suite=".length) ?? "web1";
const suite = (["web1", "web65"] as const).find((s) => s === suiteName);
if (suite === undefined) {
  throw new Error(`unknown suite ${suiteName}; use web1 or web65`);
}
const config = resolve(import.meta.dirname, "vite.config.ts");
const out = resolve(args[0] ?? "react-flow-scale-results.json");
const throttles = (args[1] ?? "1,4").split(",").map(Number);
const options = quick
  ? { suite, repeats: 1, motionMs: 500, counts: [500] }
  : { suite };

await build({ configFile: config, logLevel: "warn" });
// Any free port: a dev preview may already hold the default one.
const server = await preview({
  configFile: config,
  preview: { strictPort: false },
});
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error("preview server has no local URL");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  await page.goto(url);
  await page.waitForFunction(() => window.spike !== undefined);
  const cdp = await page.context().newCDPSession(page);
  const report = {
    browserVersion: browser.version(),
    headless: true,
    suite,
    runs: [] as unknown[],
  };
  for (const rate of throttles) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    console.log(`CPU throttle ${rate}x: measuring...`);
    const result = await page.evaluate((o) => window.spike!.runAll(o), options);
    report.runs.push({ cpuThrottle: rate, ...result });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
