import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type {
  ParseResult,
  ParseTask,
  SyntaxTree,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

/**
 * A pool of worker threads that parse C++ and Lua source in parallel
 * (`worker_threads`: real OS threads, each with its own JavaScript engine,
 * so a slow parse never freezes the main thread or the UI's server).
 *
 * Each worker handles one file at a time; files wait in a queue until a
 * worker is free. A worker that crashes fails only the file it was on and is
 * replaced.
 *
 * ```ts
 * const pool = new ParserPool();
 * const { value, errors } = await pool.parse({ language: "cpp", path, source });
 * await pool.close();
 * ```
 */
export class ParserPool {
  readonly size: number;
  private readonly idle: Worker[] = [];
  private readonly busy = new Map<Worker, Pending>();
  private readonly queue: Pending[] = [];
  private workers = 0;
  private nextId = 1;
  private closed = false;

  constructor(options: { size?: number } = {}) {
    this.size = Math.max(
      1,
      options.size ?? Math.max(1, availableParallelism() - 1),
    );
  }

  /** Parses one file. Without an extractor, the result's value is the whole tree. */
  parse(
    task: ParseTask & { extractor?: undefined },
  ): Promise<ParseResult<SyntaxTree>>;
  parse<T>(task: ParseTask): Promise<ParseResult<T>>;
  parse<T>(task: ParseTask): Promise<ParseResult<T>> {
    if (this.closed)
      return Promise.reject(new Error("The parser pool is closed"));
    return new Promise<ParseResult<T>>((resolve, reject) => {
      this.queue.push({
        request: { ...task, id: this.nextId++ },
        resolve: resolve as (r: ParseResult<unknown>) => void,
        reject,
      });
      this.pump();
    });
  }

  /** Stops every worker. Files still waiting are rejected. */
  async close(): Promise<void> {
    this.closed = true;
    for (const pending of this.queue.splice(0)) {
      pending.reject(new Error("The parser pool was closed"));
    }
    const all = [...this.idle, ...this.busy.keys()];
    for (const [, pending] of this.busy) {
      pending.reject(new Error("The parser pool was closed"));
    }
    this.idle.length = 0;
    this.busy.clear();
    await Promise.all(all.map((w) => w.terminate()));
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const worker =
        this.idle.pop() ??
        (this.workers < this.size ? this.spawn() : undefined);
      if (worker === undefined) return;
      const pending = this.queue.shift()!;
      this.busy.set(worker, pending);
      worker.postMessage(pending.request);
    }
  }

  private spawn(): Worker {
    // Run the TypeScript source in tests and the compiled file otherwise.
    const file = import.meta.url.endsWith(".ts")
      ? "./worker.ts"
      : "./worker.js";
    const worker = new Worker(new URL(file, import.meta.url));
    this.workers++;
    worker.on("message", (response: WorkerResponse) => {
      const pending = this.busy.get(worker);
      if (pending === undefined || pending.request.id !== response.id) return;
      this.busy.delete(worker);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.message));
      if (!this.closed) {
        this.idle.push(worker);
        this.pump();
      }
    });
    const lost = (error: Error): void => {
      const pending = this.busy.get(worker);
      this.busy.delete(worker);
      const at = this.idle.indexOf(worker);
      if (at >= 0) this.idle.splice(at, 1);
      this.workers--;
      pending?.reject(
        new Error(
          `The parser worker stopped while parsing ${pending.request.path}: ${error.message}`,
        ),
      );
      if (!this.closed) this.pump();
    };
    worker.on("error", lost);
    worker.on("exit", (code) => {
      if (this.busy.has(worker) || this.idle.includes(worker)) {
        lost(new Error(`exit code ${code}`));
      }
    });
    return worker;
  }
}

interface Pending {
  readonly request: WorkerRequest;
  readonly resolve: (result: ParseResult<unknown>) => void;
  readonly reject: (error: Error) => void;
}
