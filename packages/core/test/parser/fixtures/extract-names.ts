/**
 * A test extractor: runs inside the parser worker and returns the names of
 * the classes and functions it finds, plus the worker's thread ID (to prove
 * the work ran off the main thread). It imports nothing at run time,
 * because the worker loads it straight from TypeScript.
 */
import { threadId } from "node:worker_threads";
import type { Node } from "web-tree-sitter";
import type { ExtractContext } from "../../../src/parser/protocol.js";

export interface Names {
  readonly classes: string[];
  readonly functions: string[];
  readonly threadId: number;
}

export function extract(root: Node, context: ExtractContext): Names {
  const text = (n: Node | null): string => n?.text ?? "";
  if (context.language === "cpp") {
    return {
      classes: root
        .descendantsOfType("class_specifier")
        .map((c) => text(c?.childForFieldName("name") ?? null)),
      functions: root
        .descendantsOfType("function_definition")
        .map((f) =>
          text(
            f
              ?.childForFieldName("declarator")
              ?.childForFieldName("declarator") ?? null,
          ),
        ),
      threadId,
    };
  }
  return {
    classes: [],
    functions: root
      .descendantsOfType("function_declaration")
      .map((f) => text(f?.childForFieldName("name") ?? null)),
    threadId,
  };
}

/** Deliberately broken, to test that a failing extractor is reported. */
export function explode(): never {
  throw new Error("extractor failed on purpose");
}

/** Kills its worker, to test that the pool survives a crashed worker. */
export function crash(): never {
  process.exit(3);
}
