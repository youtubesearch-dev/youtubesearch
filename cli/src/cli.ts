#!/usr/bin/env node
// youtubesearch — agent-facing CLI for the YouTubeSearch REST API.
// Results to stdout, diagnostics to stderr.
// Exit codes: 0 success, 1 API/network error, 2 usage error, 3 auth error.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { ApiError, apiBase, apiRequest } from "./api.js";
import { configPath, displayKey, readConfig, resolveKey, writeConfig } from "./config.js";
import { renderCredits, renderSearch, renderSummary, renderVideo } from "./render.js";

// A closed pipe (e.g. `youtubesearch ... | head`) is a normal way for a
// consumer to stop reading — exit quietly instead of crashing.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

class UsageError extends Error {}

const TOP_USAGE = `Usage: youtubesearch <command> [options]

Agent-optimized YouTube search, transcripts, and summaries.

Commands:
  search <query>     Search videos (POST /v1/search)
  video <id>         Video metadata: stats, chapters (GET /v1/videos/{id})
  transcript <id>    Timestamped transcript (GET /v1/videos/{id}/transcript)
  summary <id>       Structured summary (GET /v1/videos/{id}/summary)
  auth login         Store an API key in the local config
  auth status        Show the configured key and credit balance

Options:
  --help             Show this help (each command also accepts --help)
  --version          Print the CLI version

Environment:
  YOUTUBESEARCH_API_KEY   API key; overrides the stored config
  YOUTUBESEARCH_API_BASE  API base URL (default ${apiBase()})

Without a key the CLI still works on the keyless tier (cached content only).
With --json, results print to stdout and errors print a typed JSON
{error, message, retryAfter?} envelope to stderr (stdout stays success-only).
Exit codes: 0 success, 1 API or network error, 2 usage error, 3 auth error.
`;

const SEARCH_USAGE = `Usage: youtubesearch search <query> [options]

Options:
  --limit <n>                          Max results (server default 10, max 20)
  --duration <short|medium|long>       Filter by video length
  --recency <hour|day|week|month|year> Filter by upload time
  --channel <name>                     Filter by channel
  --json                               Print the raw JSON response
  --help                               Show this help
`;

const VIDEO_USAGE = `Usage: youtubesearch video <id> [options]

Options:
  --json    Print the raw JSON response
  --help    Show this help
`;

const TRANSCRIPT_USAGE = `Usage: youtubesearch transcript <id> [options]

Options:
  --format <markdown|json|plain>  Output format (default markdown)
  --start <seconds>               Window start
  --end <seconds>                 Window end
  --max-tokens <n>                Truncate to roughly this many tokens
  --help                          Show this help

markdown/plain print the transcript text; json prints the full JSON response.
`;

const SUMMARY_USAGE = `Usage: youtubesearch summary <id> [options]

Options:
  --sections <a,b,c>  Comma-separated section names (e.g. key_points,insights)
  --json              Print the raw JSON response
  --help              Show this help
`;

const AUTH_USAGE = `Usage: youtubesearch auth <login|status>

Subcommands:
  login [--key ys_live_...]  Store an API key (reads stdin when --key is absent)
  status                     Show the configured key and credit balance
`;

const AUTH_LOGIN_USAGE = `Usage: youtubesearch auth login [--key ys_live_...]

Stores the key in ${configPath()} (mode 0600).
When --key is absent the key is read from stdin.
`;

const AUTH_STATUS_USAGE = `Usage: youtubesearch auth status

Shows whether a key is configured and its credit balance (GET /v1/credits).
`;

type FlagSpec = Record<string, { type: "string" | "boolean" }>;

interface Parsed {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

/**
 * Subcommand pattern: the command name has already been shifted off, so the
 * remaining args (flags after the subcommand) get a strict parse.
 */
function parseFlags(args: string[], flags: FlagSpec): Parsed {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { ...flags, help: { type: "boolean" } },
      strict: true,
      allowPositionals: true,
    });
    return { values, positionals };
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
}

function parseNumberFlag(value: string | boolean | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(n)) {
    throw new UsageError(`${flag} expects a number, got '${String(value)}'`);
  }
  return n;
}

function parseChoiceFlag(
  value: string | boolean | undefined,
  flag: string,
  choices: readonly string[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new UsageError(`${flag} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

function requireId(positionals: string[], usage: string): string {
  const id = positionals[0];
  if (!id) throw new UsageError(`missing <id> argument\n${usage.trimEnd()}`);
  if (positionals.length > 1) {
    throw new UsageError(`unexpected extra argument '${positionals[1]}'`);
  }
  return id;
}

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/** True when the caller asked for --json output anywhere in the argv. */
function wantsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

/**
 * Error twin of --json: emit the typed envelope to stderr so stdout stays
 * success-only and an agent can parse the failure the same way it parses a hit.
 */
function printErrorEnvelope(code: string, message: string, retryAfter?: number): void {
  const envelope: { error: string; message: string; retryAfter?: number } = { error: code, message };
  if (retryAfter !== undefined) envelope.retryAfter = retryAfter;
  process.stderr.write(JSON.stringify(envelope) + "\n");
}

function readLineFromStdin(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    let done = false;
    rl.once("line", (line) => {
      done = true;
      rl.close();
      resolve(line);
    });
    rl.once("close", () => {
      if (!done) resolve("");
    });
  });
}

function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version?: string;
  };
  return pkg.version ?? "0.0.0";
}

// ---------------------------------------------------------------- commands

async function cmdAuthLogin(args: string[]): Promise<number> {
  const { values } = parseFlags(args, { key: { type: "string" } });
  if (values.help) {
    process.stdout.write(AUTH_LOGIN_USAGE);
    return 0;
  }
  let key = typeof values.key === "string" ? values.key.trim() : "";
  if (key === "") {
    if (process.stdin.isTTY) process.stderr.write("Enter your API key (ys_live_...): ");
    key = (await readLineFromStdin()).trim();
  }
  if (key === "") {
    throw new UsageError("no API key provided (pass --key or pipe the key on stdin)");
  }
  const config = readConfig();
  config.api_key = key;
  writeConfig(config);
  process.stdout.write(`Saved API key ${displayKey(key)} to ${configPath()}\n`);
  return 0;
}

async function cmdAuthStatus(args: string[]): Promise<number> {
  const { values } = parseFlags(args, {});
  if (values.help) {
    process.stdout.write(AUTH_STATUS_USAGE);
    return 0;
  }
  const { key, source } = resolveKey();
  if (!key) {
    process.stdout.write(
      "No API key configured (keyless tier: cached content only).\n" +
        "Run 'youtubesearch auth login' to add one.\n",
    );
    return 0;
  }
  const from = source === "env" ? "YOUTUBESEARCH_API_KEY env var" : configPath();
  process.stdout.write(`API key: ${displayKey(key)} (from ${from})\n`);
  const credits = await apiRequest("/v1/credits", key);
  process.stdout.write(renderCredits(credits));
  return 0;
}

async function cmdSearch(args: string[]): Promise<number> {
  const { values, positionals } = parseFlags(args, {
    limit: { type: "string" },
    duration: { type: "string" },
    recency: { type: "string" },
    channel: { type: "string" },
    json: { type: "boolean" },
  });
  if (values.help) {
    process.stdout.write(SEARCH_USAGE);
    return 0;
  }
  const query = positionals.join(" ").trim();
  if (query === "") throw new UsageError(`missing <query> argument\n${SEARCH_USAGE.trimEnd()}`);

  const limit = parseNumberFlag(values.limit, "--limit");
  const duration = parseChoiceFlag(values.duration, "--duration", ["short", "medium", "long"]);
  const recency = parseChoiceFlag(values.recency, "--recency", [
    "hour",
    "day",
    "week",
    "month",
    "year",
  ]);
  const channel = typeof values.channel === "string" ? values.channel : undefined;

  const body: Record<string, unknown> = { query };
  if (limit !== undefined) body.limit = limit;
  if (duration || recency || channel) body.filters = { duration, recency, channel };

  const { key } = resolveKey();
  const result = await apiRequest("/v1/search", key, { method: "POST", body });
  if (values.json) printJson(result);
  else process.stdout.write(renderSearch(result));
  return 0;
}

async function cmdVideo(args: string[]): Promise<number> {
  const { values, positionals } = parseFlags(args, { json: { type: "boolean" } });
  if (values.help) {
    process.stdout.write(VIDEO_USAGE);
    return 0;
  }
  const id = requireId(positionals, VIDEO_USAGE);
  const { key } = resolveKey();
  const result = await apiRequest(`/v1/videos/${encodeURIComponent(id)}`, key);
  if (values.json) printJson(result);
  else process.stdout.write(renderVideo(result));
  return 0;
}

async function cmdTranscript(args: string[]): Promise<number> {
  const { values, positionals } = parseFlags(args, {
    format: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    "max-tokens": { type: "string" },
  });
  if (values.help) {
    process.stdout.write(TRANSCRIPT_USAGE);
    return 0;
  }
  const id = requireId(positionals, TRANSCRIPT_USAGE);
  const format =
    parseChoiceFlag(values.format, "--format", ["markdown", "json", "plain"]) ?? "markdown";

  const { key } = resolveKey();
  const result = await apiRequest(`/v1/videos/${encodeURIComponent(id)}/transcript`, key, {
    query: {
      format,
      start: parseNumberFlag(values.start, "--start"),
      end: parseNumberFlag(values.end, "--end"),
      max_tokens: parseNumberFlag(values["max-tokens"], "--max-tokens"),
    },
  });

  if (format === "json") {
    printJson(result);
    return 0;
  }
  const payload = (result ?? {}) as Record<string, unknown>;
  if (payload.truncated === true) {
    process.stderr.write("note: transcript truncated (--max-tokens)\n");
  }
  const text = typeof payload.transcript === "string" ? payload.transcript : "";
  process.stdout.write(text.endsWith("\n") || text === "" ? text : text + "\n");
  return 0;
}

async function cmdSummary(args: string[]): Promise<number> {
  const { values, positionals } = parseFlags(args, {
    sections: { type: "string" },
    json: { type: "boolean" },
  });
  if (values.help) {
    process.stdout.write(SUMMARY_USAGE);
    return 0;
  }
  const id = requireId(positionals, SUMMARY_USAGE);
  const sections = typeof values.sections === "string" ? values.sections : undefined;

  const { key } = resolveKey();
  const result = await apiRequest(`/v1/videos/${encodeURIComponent(id)}/summary`, key, {
    query: { sections },
  });
  if (values.json) printJson(result);
  else process.stdout.write(renderSummary(result));
  return 0;
}

// ---------------------------------------------------------------- dispatch

async function run(argv: string[]): Promise<number> {
  const command = argv[0];

  if (command === undefined) {
    process.stderr.write(TOP_USAGE);
    return 2;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(TOP_USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(cliVersion() + "\n");
    return 0;
  }

  const rest = argv.slice(1);
  switch (command) {
    case "auth": {
      const sub = rest[0];
      if (sub === "login") return cmdAuthLogin(rest.slice(1));
      if (sub === "status") return cmdAuthStatus(rest.slice(1));
      if (sub === "--help" || sub === "-h") {
        process.stdout.write(AUTH_USAGE);
        return 0;
      }
      throw new UsageError(
        sub === undefined ? `missing auth subcommand\n${AUTH_USAGE.trimEnd()}` : `unknown auth subcommand '${sub}'`,
      );
    }
    case "search":
      return cmdSearch(rest);
    case "video":
      return cmdVideo(rest);
    case "transcript":
      return cmdTranscript(rest);
    case "summary":
      return cmdSummary(rest);
    default:
      throw new UsageError(`unknown command '${command}'\nRun 'youtubesearch --help' for usage.`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = wantsJson(argv);
  try {
    process.exitCode = await run(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      if (json) printErrorEnvelope("USAGE", err.message);
      else process.stderr.write(`error: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (err instanceof ApiError) {
      const retry = err.retryAfter !== null ? Number(err.retryAfter) : NaN;
      const showRetry = (err.status === 402 || err.status === 429) && Number.isFinite(retry);
      if (json) {
        printErrorEnvelope(err.code, err.message, showRetry ? retry : undefined);
      } else {
        process.stderr.write(`${err.code}: ${err.message}\n`);
        if (err.status === 401 && err.code === "KEY_REQUIRED") {
          process.stderr.write("hint: run 'youtubesearch auth login' to configure an API key\n");
        }
        if (showRetry) {
          process.stderr.write(`retry-after: ${retry}s\n`);
        }
      }
      // A 400 usage-class error (bad video id / invalid params) is a usage
      // error on our side too — exit 2, matching the documented contract that
      // exit 2 means usage error (the API validates the 11-char id pattern).
      const usageError =
        err.status === 400 && (err.code === "INVALID_VIDEO_ID" || err.code === "INVALID_REQUEST");
      process.exitCode = err.status === 401 || err.status === 403 ? 3 : usageError ? 2 : 1;
      return;
    }
    if (json) printErrorEnvelope("ERROR", err instanceof Error ? err.message : String(err));
    else process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

void main();
