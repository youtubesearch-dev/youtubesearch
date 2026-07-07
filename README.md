# YouTubeSearch

**Clean YouTube data for AI agents.** Search videos, read metadata, pull
timestamped transcripts and structured summaries — as an API, a hosted MCP
server, and a CLI. We return data, not answers: your agent does the reasoning.

This repo contains the open-source clients:

| Directory | What |
|---|---|
| [`mcp/`](./mcp) | The MCP server (Python, Streamable HTTP) — the same code that runs the hosted endpoint |
| [`cli/`](./cli) | The `youtubesearch` CLI (TypeScript, zero runtime deps) |
| [`examples/`](./examples) | Runnable agent examples and MCP config snippets |

The API itself (ingestion, index, cache) is a hosted service:
**[youtubesearch.dev](https://youtubesearch.dev)** · API docs at
**[youtubesearch.dev/docs](https://youtubesearch.dev/docs)**.

## The four operations

| Operation | REST | MCP tool |
|---|---|---|
| Search videos (native metadata + cached summaries) | `POST /v1/search` | `search_videos` |
| Video metadata + chapters | `GET /v1/videos/{id}` | `get_video` |
| Timestamped transcript (windowable, token-cappable) | `GET /v1/videos/{id}/transcript` | `get_transcript` |
| Structured summary (sectioned) | `GET /v1/videos/{id}/summary` | `get_summary` |

Every video returns a transcript — captions when they exist, speech-to-text
when they don't. Errors are typed (`{"error": "CODE", "message": "..."}`) and
failed calls are never billed.

## Quickstart 1 — hosted MCP (recommended)

The hosted server lives at `https://mcp.youtubesearch.dev/mcp` (Streamable
HTTP). One line for Claude Code:

```bash
claude mcp add --transport http youtubesearch https://mcp.youtubesearch.dev/mcp \
  --header "Authorization: Bearer ys_live_..."   # omit --header to run keyless
```

Keyless gives you cached content and search (rate-limited per IP). A free key
— 1,000 credits/month — takes a minute at
[youtubesearch.dev](https://youtubesearch.dev).

Configs for Claude Desktop and other MCP clients:
[`examples/mcp-config.md`](./examples/mcp-config.md).

## Quickstart 2 — CLI

```bash
npx @youtubesearch/cli search "karpathy intro to large language models" --limit 5
npx @youtubesearch/cli transcript zjkBMFhNj_g --start 1663 --end 2012   # the Tool Use chapter
npx @youtubesearch/cli summary zjkBMFhNj_g --sections executive_summary,key_points
npx @youtubesearch/cli auth login    # paste your key once (keyless works without it)
```

Every command above works keyless — that video is cached.

> `@youtubesearch/cli` is publishing to npm this week; until then, run it from
> source (below).

Results go to stdout, diagnostics to stderr, `--json` everywhere — built for
pipelines and agents, not humans squinting at colors.

## Quickstart 3 — REST

```bash
curl -X POST https://api.youtubesearch.dev/v1/search \
  -H "Authorization: Bearer ys_live_..." \
  -H "Content-Type: application/json" \
  -d '{"query": "rust async explained", "limit": 5}'
```

Machine-readable spec: `GET https://api.youtubesearch.dev/v1/openapi.json`.
Full reference: [youtubesearch.dev/docs](https://youtubesearch.dev/docs).

## Running from source

**MCP server** (Python ≥ 3.12, [uv](https://docs.astral.sh/uv/)):

```bash
cd mcp
uv sync
uv run python -m yts_mcp.server        # Streamable HTTP on :8000, /health
```

The server is a thin stateless client of the public API — it forwards your
`Authorization` header per request and holds no state, so any replica serves
any request. Point it elsewhere with `YTS_API_BASE`.

**CLI** (Node ≥ 20):

```bash
cd cli
npm ci && npm run build
node dist/cli.js video zjkBMFhNj_g     # works keyless — this video is cached
```

## Tiers

| Tier | Access | Credits/month |
|---|---|---|
| keyless (no header) | cached content + search, rate-limited per IP | — |
| free | everything | 1,000 |
| pro | everything, higher rate | 20,000 |

Reads of cached content cost 1 credit; cold transcript/summary generation
costs more (see the [credit schedule](https://youtubesearch.dev/docs)).
Responses carry `X-Credits-Charged` and `X-Credits-Remaining`; check your
balance free at `GET /v1/credits`.

## License

[MIT](./LICENSE) © 2026 YouTubeSearch
