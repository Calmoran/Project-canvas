/**
 * The parser worker: runs in its own thread, so parsing never blocks the
 * main thread. It loads web-tree-sitter (tree-sitter compiled to
 * WebAssembly, so no C++ compiler is needed on any platform) and the
 * vendored grammars, parses each file it is sent, runs the task's
 * extractor on the tree, and sends back plain data.
 *
 * This file imports only Node built-ins and web-tree-sitter at run time
 * (type imports disappear when compiled), so Node can run it directly from
 * the TypeScript source in tests as well as from the compiled `dist/`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parentPort } from "node:worker_threads";
import { Language, Parser, type Node } from "web-tree-sitter";
import type {
  ErrorRegion,
  ExtractContext,
  ParseLanguage,
  SourcePoint,
  SyntaxTree,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

const vendorDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "vendor",
);
const GRAMMAR_FILES: Record<ParseLanguage, string> = {
  cpp: "tree-sitter-cpp.wasm",
  lua: "tree-sitter-lua.wasm",
};

type Extractor = (root: Node, context: ExtractContext) => unknown;

let ready: Promise<void> | undefined;
const languages = new Map<ParseLanguage, Promise<Language>>();
const extractors = new Map<string, Promise<Extractor>>();

function language(name: ParseLanguage): Promise<Language> {
  let loaded = languages.get(name);
  if (loaded === undefined) {
    loaded = Language.load(join(vendorDir, GRAMMAR_FILES[name]));
    languages.set(name, loaded);
  }
  return loaded;
}

function extractor(module: string, name: string): Promise<Extractor> {
  const key = `${module}#${name}`;
  let loaded = extractors.get(key);
  if (loaded === undefined) {
    const url =
      /^[a-z]+:/i.test(module) && !/^[a-z]:[\\/]/i.test(module)
        ? module
        : pathToFileURL(module).href;
    loaded = import(url).then((m: Record<string, unknown>) => {
      const fn = m[name];
      if (typeof fn !== "function") {
        throw new Error(`${module} has no exported function '${name}'`);
      }
      return fn as Extractor;
    });
    extractors.set(key, loaded);
  }
  return loaded;
}

const point = (
  p: { row: number; column: number },
  index: number,
): SourcePoint => ({
  line: p.row + 1,
  col: p.column + 1,
  index,
});

function errorRegions(root: Node): ErrorRegion[] {
  const regions: ErrorRegion[] = [];
  const visit = (node: Node): void => {
    if (node.isError || node.isMissing) {
      regions.push({
        kind: node.isError ? "error" : "missing",
        start: point(node.startPosition, node.startIndex),
        end: point(node.endPosition, node.endIndex),
      });
      return; // an ERROR node's insides are the unparsed text itself
    }
    if (!node.hasError) return; // nothing below has an error
    for (const child of node.children) visit(child);
  };
  visit(root);
  return regions;
}

/** The default extractor: the whole tree as plain data. */
function serialize(node: Node): SyntaxTree {
  return {
    type: node.type,
    named: node.isNamed,
    start: point(node.startPosition, node.startIndex),
    end: point(node.endPosition, node.endIndex),
    children: node.children.map(serialize),
  };
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  ready ??= Parser.init();
  await ready;
  const parser = new Parser();
  try {
    parser.setLanguage(await language(request.language));
    const tree = parser.parse(request.source);
    if (tree === null)
      throw new Error(`${request.path}: the parser returned no tree`);
    try {
      const context: ExtractContext = {
        path: request.path,
        language: request.language,
        source: request.source,
      };
      const value =
        request.extractor === undefined
          ? serialize(tree.rootNode)
          : (
              await extractor(
                request.extractor.module,
                request.extractor.name ?? "extract",
              )
            )(tree.rootNode, context);
      return {
        id: request.id,
        ok: true,
        result: {
          path: request.path,
          language: request.language,
          errors: errorRegions(tree.rootNode),
          value,
        },
      };
    } finally {
      tree.delete(); // trees live in WebAssembly memory, which is not garbage-collected
    }
  } finally {
    parser.delete();
  }
}

parentPort?.on("message", (request: WorkerRequest) => {
  handle(request).then(
    (response) => parentPort?.postMessage(response),
    (error: unknown) =>
      parentPort?.postMessage({
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse),
  );
});
