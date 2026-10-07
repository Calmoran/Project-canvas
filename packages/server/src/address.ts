/**
 * The only address Canvas listens on. 127.0.0.1 is reachable from this
 * computer alone, so the database connection details and the graph are
 * never offered to the network (architecture section 8).
 */
export const LOOPBACK_HOST = "127.0.0.1";

/** The port used when none is given. */
export const DEFAULT_PORT = 4870;
