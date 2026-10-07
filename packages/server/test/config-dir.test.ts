import { describe, expect, test } from "vitest";
import { configDirFor } from "../src/index.js";

describe("configDirFor", () => {
  test("Windows: the roaming application-data folder", () => {
    expect(
      configDirFor({
        platform: "win32",
        env: { APPDATA: "D:\\Users\\sam\\AppData\\Roaming" },
        home: "D:\\Users\\sam",
      }),
    ).toBe("D:\\Users\\sam\\AppData\\Roaming\\Canvas");
  });

  test("Windows without APPDATA falls back to its usual place", () => {
    expect(
      configDirFor({ platform: "win32", env: {}, home: "C:\\Users\\sam" }),
    ).toBe("C:\\Users\\sam\\AppData\\Roaming\\Canvas");
  });

  test("macOS: Application Support", () => {
    expect(
      configDirFor({
        platform: "darwin",
        env: { XDG_CONFIG_HOME: "/elsewhere" },
        home: "/Users/sam",
      }),
    ).toBe("/Users/sam/Library/Application Support/Canvas");
  });

  test("Linux: XDG_CONFIG_HOME when set", () => {
    expect(
      configDirFor({
        platform: "linux",
        env: { XDG_CONFIG_HOME: "/data/config" },
        home: "/home/sam",
      }),
    ).toBe("/data/config/canvas");
  });

  test("Linux: ~/.config when XDG_CONFIG_HOME is unset or relative", () => {
    for (const env of [{}, { XDG_CONFIG_HOME: "config" }]) {
      expect(configDirFor({ platform: "linux", env, home: "/home/sam" })).toBe(
        "/home/sam/.config/canvas",
      );
    }
  });
});
