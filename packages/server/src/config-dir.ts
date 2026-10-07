import { homedir } from "node:os";
import path from "node:path";

export interface ConfigDirEnvironment {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
}

/**
 * The folder where Canvas keeps its per-user files: workspace records and
 * each workspace's SQLite file. Each operating system has its own place for
 * this, and following it means backup tools, roaming profiles and uninstall
 * tools treat Canvas's files the way the user expects:
 *
 * - Windows: `%APPDATA%\Canvas` (the roaming application-data folder).
 * - macOS: `~/Library/Application Support/Canvas`.
 * - Linux and others: `$XDG_CONFIG_HOME/canvas`, else `~/.config/canvas`
 *   (the XDG Base Directory rules, which also say a relative
 *   `XDG_CONFIG_HOME` must be ignored).
 */
export function configDirFor({
  platform,
  env,
  home,
}: ConfigDirEnvironment): string {
  if (platform === "win32") {
    const appData = env["APPDATA"];
    const base =
      appData !== undefined && path.win32.isAbsolute(appData)
        ? appData
        : path.win32.join(home, "AppData", "Roaming");
    return path.win32.join(base, "Canvas");
  }
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "Application Support", "Canvas");
  }
  const xdg = env["XDG_CONFIG_HOME"];
  const base =
    xdg !== undefined && path.posix.isAbsolute(xdg)
      ? xdg
      : path.posix.join(home, ".config");
  return path.posix.join(base, "canvas");
}

/** The config folder for the current user on this machine. */
export function defaultConfigDir(): string {
  return configDirFor({
    platform: process.platform,
    env: process.env,
    home: homedir(),
  });
}
