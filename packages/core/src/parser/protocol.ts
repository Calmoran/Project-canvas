/**
 * The messages and results passed between the parser pool and its worker
 * threads. Everything here crosses a thread boundary, so it is plain data:
 * a syntax tree itself lives in the worker's WebAssembly memory and cannot
 * be sent, which is why a task names an extractor that runs where the tree
 * is, and only the extractor's result comes back.
 */

export type ParseLanguage = "cpp" | "lua";

/** A position in a source file. Lines and columns start at 1. */
export interface SourcePoint {
  readonly line: number;
  readonly col: number;
  /** tree-sitter's index into the source text as given. */
  readonly index: number;
}

export interface SourceRange {
  readonly start: SourcePoint;
  readonly end: SourcePoint;
}

/**
 * Where the parser could not make sense of the text: an `ERROR` node (text
 * it skipped) or a `MISSING` node (a token it assumed, such as a `;`).
 * Constructs outside these ranges are still parsed normally.
 */
export interface ErrorRegion extends SourceRange {
  readonly kind: "error" | "missing";
}

/** A syntax tree as plain data, returned when a task names no extractor. */
export interface SyntaxTree extends SourceRange {
  readonly type: string;
  /** False for punctuation and keywords, true for real constructs. */
  readonly named: boolean;
  readonly children: readonly SyntaxTree[];
}

/**
 * A module and the name of a function it exports, which runs in the worker:
 * `(root, context) => result`. `root` is the web-tree-sitter root node, and
 * the result must be plain data (it is copied back to the caller).
 */
export interface ExtractorRef {
  readonly module: string;
  /** Export name; defaults to `extract`. */
  readonly name?: string;
}

export interface ExtractContext {
  readonly path: string;
  readonly language: ParseLanguage;
  readonly source: string;
}

export interface ParseTask {
  readonly language: ParseLanguage;
  readonly source: string;
  /** Repository-relative path, used in results and error messages. */
  readonly path: string;
  readonly extractor?: ExtractorRef;
}

export interface ParseResult<T> {
  readonly path: string;
  readonly language: ParseLanguage;
  readonly errors: readonly ErrorRegion[];
  readonly value: T;
}

export type WorkerRequest = ParseTask & { readonly id: number };

export type WorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly result: ParseResult<unknown>;
    }
  | { readonly id: number; readonly ok: false; readonly message: string };
