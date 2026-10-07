/**
 * Local-only: checks every citation of the AzerothCore profile against the
 * clean checkout named by `CANVAS_SOURCE_CORE` (and likewise for any other
 * source the profile lists). Skipped when the variable is unset, as in CI.
 */
import { describe, expect, test } from "vitest";
import { azerothcore335, citationsOf } from "../src/index.js";
import {
  checkoutEnvName,
  citationProblems,
  gitReader,
} from "./support/citations.js";

const uses = citationsOf(azerothcore335);

for (const [source, commit] of Object.entries(azerothcore335.sources)) {
  const envName = checkoutEnvName(source);
  const dir = process.env[envName];
  describe.skipIf(dir === undefined || dir === "")(
    `citations into '${source}' (checkout from ${envName})`,
    () => {
      // Reads each cited file from the checkout with two git processes;
      // the full profile cites hundreds of files, which outgrows the
      // default timeout on Windows.
      test(`every cited file exists at ${commit.slice(0, 8)} and every cited line is within it`, () => {
        const read = gitReader(dir!, commit);
        const mine = uses.filter((u) => u.citation.source === source);
        expect(citationProblems(mine, read)).toEqual([]);
      }, 60_000);
    },
  );
}
