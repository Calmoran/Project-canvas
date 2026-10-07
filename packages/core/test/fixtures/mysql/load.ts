import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection, type Connection } from "mysql2/promise";

/**
 * The MySQL server tests may use, as a URL such as
 * `mysql://root:secret@127.0.0.1:3306`. CI sets it on Linux, where a MySQL 8
 * service container runs. When it is unset (Windows CI, most contributor
 * PCs) the MySQL tests are skipped, never silently passed.
 */
export const MYSQL_TEST_URL_ENV = "CANVAS_TEST_MYSQL_URL";

export function mysqlTestUrl(): string | undefined {
  const url = process.env[MYSQL_TEST_URL_ENV];
  return url === undefined || url === "" ? undefined : url;
}

const fixtureDir = dirname(fileURLToPath(import.meta.url));

/**
 * Creates (or recreates) a database and loads the fixture `.sql` files into
 * it in file-name order. Returns a connection to that database; the caller
 * closes it.
 */
export async function loadMysqlFixture(
  url: string,
  database = "canvas_fixture",
): Promise<Connection> {
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Not a plain database name: ${database}`);
  }
  const admin = await createConnection({ uri: url, multipleStatements: true });
  try {
    await admin.query(
      `DROP DATABASE IF EXISTS \`${database}\`; CREATE DATABASE \`${database}\``,
    );
  } finally {
    await admin.end();
  }

  const connection = await createConnection({
    uri: url,
    database,
    multipleStatements: true,
  });
  const files = readdirSync(fixtureDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await connection.query(readFileSync(join(fixtureDir, file), "utf8"));
  }
  return connection;
}
