// XDG config read/write for the stored API key.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
  api_key?: string;
}

export function configDir(): string {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(base, "youtubesearch");
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "youtubesearch");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function readConfig(): CliConfig {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    if (parsed !== null && typeof parsed === "object") return parsed as CliConfig;
  } catch {
    // Missing or unreadable config is the same as no config.
  }
  return {};
}

export function writeConfig(config: CliConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const file = configPath();
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  // writeFileSync's mode only applies when creating the file; enforce it on
  // overwrite too so the key never sits in a group/world-readable file.
  chmodSync(file, 0o600);
}

export type KeySource = "env" | "config";

/** Resolve the API key: YOUTUBESEARCH_API_KEY env var wins over the config file. */
export function resolveKey(): { key?: string; source?: KeySource } {
  const envKey = process.env.YOUTUBESEARCH_API_KEY;
  if (envKey) return { key: envKey, source: "env" };
  const fileKey = readConfig().api_key;
  if (fileKey) return { key: fileKey, source: "config" };
  return {};
}

/**
 * Display form of a key: prefix + first 4 and last 4 chars of the random part.
 * Never returns the full key.
 */
export function displayKey(key: string): string {
  const match = /^(ys_[a-z]+_)(.*)$/.exec(key);
  const prefix = match ? match[1] : "";
  const random = match ? match[2] : key;
  if (random.length <= 8) return `${prefix}${"*".repeat(random.length)}`;
  return `${prefix}${random.slice(0, 4)}...${random.slice(-4)}`;
}
