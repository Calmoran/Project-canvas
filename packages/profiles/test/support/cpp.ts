/**
 * Small text checks on C++ source, used by the local-only tests to confirm
 * that a citation points at what the profile says it does. They read lines,
 * not a syntax tree: enough to catch a wrong line number, not a parser.
 */

/** The qualified name (`Class::Function`) of the definition enclosing `line` (1-based). */
export function enclosingFunction(
  lines: readonly string[],
  line: number,
): string | undefined {
  for (let i = line - 1; i >= 0; i--) {
    const m = /^[A-Za-z][\w:<>,\s*&]*?\b(\w+(?:::\w+)+)\s*\(/.exec(lines[i]!);
    if (m !== null) return m[1];
  }
  return undefined;
}

/** Whether `text` names `table` as a whole word, with or without backticks. */
export function namesTable(text: string, table: string): boolean {
  return new RegExp(`(^|[^\\w])\`?${table}\`?([^\\w]|$)`).test(text);
}

/** Whether `text` is the `#define` of macro `symbol`. */
export function definesMacro(text: string, symbol: string): boolean {
  return text.startsWith(`#define ${symbol}(`);
}

/**
 * Whether `text` declares a script constructor taking the name first, or
 * opens the class (for a class that inherits its base's constructor).
 */
export function declaresNamedConstructor(
  text: string,
  symbol: string,
): boolean {
  return (
    new RegExp(`^\\s+${symbol}\\(char const\\* name\\b`).test(text) ||
    text.startsWith(`class ${symbol} : public `)
  );
}
