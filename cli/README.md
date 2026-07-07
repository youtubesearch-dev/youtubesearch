# @youtubesearch/cli

Agent-optimized YouTube search, transcripts, and summaries from your shell —
the CLI for the [YouTubeSearch](https://youtubesearch.dev) API. Results to
stdout, diagnostics to stderr, `--json` everywhere, meaningful exit codes.

```bash
npx @youtubesearch/cli search "karpathy intro to large language models" --limit 5
npx @youtubesearch/cli video zjkBMFhNj_g
npx @youtubesearch/cli transcript zjkBMFhNj_g --start 1663 --end 2012 --format markdown
npx @youtubesearch/cli summary zjkBMFhNj_g --sections executive_summary,key_points
```

All of the above work **keyless** on cached content. For everything else, get
a free key (1,000 credits/month) at [youtubesearch.dev](https://youtubesearch.dev):

```bash
npx @youtubesearch/cli auth login     # stores the key in your config dir, mode 0600
npx @youtubesearch/cli auth status    # shows the key + credit balance
```

## Commands

| Command | Does |
|---|---|
| `search <query>` | Search videos (`--limit`, `--duration`, `--recency`, `--channel`) |
| `video <id>` | Metadata, stats, chapters |
| `transcript <id>` | Timestamped transcript (`--format`, `--start`, `--end`, `--max-tokens`) |
| `summary <id>` | Structured summary (`--sections a,b,c`) |
| `auth login` / `auth status` | Manage the stored API key |

Exit codes: `0` success · `1` API/network error · `2` usage error · `3` auth error.

## Environment

| Var | What |
|---|---|
| `YOUTUBESEARCH_API_KEY` | API key; overrides the stored config |
| `YOUTUBESEARCH_API_BASE` | API base URL (default `https://api.youtubesearch.dev`) |

## From source

Node ≥ 20, zero runtime dependencies:

```bash
npm ci && npm run build
node dist/cli.js --help
```

API docs: [youtubesearch.dev/docs](https://youtubesearch.dev/docs) ·
MIT © 2026 YouTubeSearch
