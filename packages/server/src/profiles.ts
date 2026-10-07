import type { Profile } from "@canvas/core";
import { azerothcore335 } from "@canvas/profiles";

/** The core profiles this Canvas ships, by ID; a workspace names one. */
export const PROFILES: ReadonlyMap<string, Profile> = new Map(
  [azerothcore335].map((p) => [p.id, p]),
);

/** The IDs of the shipped profiles. */
export const PROFILE_IDS: readonly string[] = [...PROFILES.keys()];
