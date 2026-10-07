import {
  CODE_EDGE_TYPES,
  type EdgeLocation,
  ProfileSchema,
  parseCitation,
  type ParsedCitation,
  type Profile,
} from "@canvas/core";

/** One thing wrong with a profile, at a dotted path such as `edges.3.type`. */
export interface ProfileProblem {
  readonly path: string;
  readonly message: string;
}

/** One citation of a profile, with the definition that carries it. */
export interface CitationUse {
  /** Where the citation sits, e.g. `loaders.2.source.0`. */
  readonly path: string;
  readonly citation: ParsedCitation;
}

type Cited = { readonly source: readonly string[] };

/** Every cited part of a profile, with the path of its array. */
function citedParts(profile: Profile): [string, readonly Cited[]][] {
  return [
    ["databases.world", profile.databases.world],
    ["databases.characters", profile.databases.characters],
    ["databases.auth", profile.databases.auth],
    ["dbc", profile.dbc],
    ["edges", profile.edges],
    ["bindings", profile.bindings],
    ["loaders", profile.loaders],
    ["overrides", profile.overrides],
    ["expectations", profile.expectations],
    ["labels", profile.labels],
  ];
}

/** Every citation in a valid profile. */
export function citationsOf(profile: Profile): CitationUse[] {
  return citedParts(profile).flatMap(([path, defs]) =>
    defs.flatMap((def, d) =>
      def.source.flatMap((text, c) => {
        const citation = parseCitation(text);
        return citation === undefined
          ? []
          : [{ path: `${path}.${d}.source.${c}`, citation }];
      }),
    ),
  );
}

/**
 * The identity of each definition within its part: two definitions with the
 * same identity describe the same thing twice, and a reader could not tell
 * which one wins. Tables are named per database; a loader is one function
 * reading one table, so a table read by two functions is not a duplicate.
 * An edge type may be read from several places (eight spell columns on one
 * table, say), so an edge is one type at one location (Alex's decision on
 * PROF-1's uniqueness rule, 2026-10-07).
 */
/** One readable name for where an edge's value is read. */
function locationOf(at: EdgeLocation): string {
  return at.source === "mysql"
    ? `${at.database}.${at.table}.${at.column}`
    : `${at.file} field ${at.field}`;
}

function identities(profile: Profile): [string, string[]][] {
  return [
    ["databases.world", profile.databases.world.map((t) => t.name)],
    ["databases.characters", profile.databases.characters.map((t) => t.name)],
    ["databases.auth", profile.databases.auth.map((t) => t.name)],
    ["dbc", profile.dbc.map((l) => l.file)],
    ["edges", profile.edges.map((e) => `${e.type} at ${locationOf(e.at)}`)],
    ["bindings", profile.bindings.map((b) => b.id)],
    [
      "loaders",
      profile.loaders.map((l) => `${l.database}.${l.table} by ${l.function}`),
    ],
    ["overrides", profile.overrides.map((o) => o.layer)],
    ["expectations", profile.expectations.map((r) => r.id)],
    ["labels", profile.labels.map((l) => l.kind)],
    ["deadTables", profile.deadTables],
  ];
}

function duplicateProblems(profile: Profile): ProfileProblem[] {
  const problems: ProfileProblem[] = [];
  for (const [part, ids] of identities(profile)) {
    const first = new Map<string, number>();
    ids.forEach((id, index) => {
      const earlier = first.get(id);
      if (earlier === undefined) {
        first.set(id, index);
      } else {
        problems.push({
          path: `${part}.${index}`,
          message: `'${id}' is defined twice in ${part} (first at index ${earlier})`,
        });
      }
    });
  }
  const codeTypes: readonly string[] = CODE_EDGE_TYPES;
  profile.edges.forEach((edge, index) => {
    if (codeTypes.includes(edge.type)) {
      problems.push({
        path: `edges.${index}.type`,
        message: `'${edge.type}' is a code-layer edge type fixed in core; a profile edge cannot redefine it`,
      });
    }
  });
  return problems;
}

/**
 * Everything wrong with a profile: whatever the core `Profile` schema
 * rejects (a definition without a `source` citation, a node kind that does
 * not exist, a citation naming an unlisted source), then anything defined
 * twice. An empty list means the profile is sound.
 */
export function checkProfile(candidate: unknown): ProfileProblem[] {
  const parsed = ProfileSchema.safeParse(candidate);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
  }
  return duplicateProblems(parsed.data);
}
