# youtubesearch-mcp

MCP server for [YouTubeSearch](https://youtubesearch.dev) — clean YouTube data
for AI agents. Exposes the four API operations as read-only tools over
stateless Streamable HTTP:

| Tool | Does |
|---|---|
| `search_videos` | Search YouTube; native metadata + cached executive summaries |
| `get_video` | Metadata, stats, full description, chapters |
| `get_transcript` | Timestamped transcript; `format=markdown\|json\|plain`, time window, token cap |
| `get_summary` | Structured summary; select sections to save tokens |

**Most people should use the hosted endpoint** — no install:

```bash
claude mcp add --transport http youtubesearch https://mcp.youtubesearch.dev/mcp \
  --header "Authorization: Bearer ys_live_..."   # omit --header to run keyless
```

Free key (1,000 credits/month): [youtubesearch.dev](https://youtubesearch.dev)
· API docs: [youtubesearch.dev/docs](https://youtubesearch.dev/docs)

## Run it yourself

Python ≥ 3.12 and [uv](https://docs.astral.sh/uv/):

```bash
uv sync
uv run python -m yts_mcp.server   # Streamable HTTP on 0.0.0.0:8000, GET /health
```

The server is a thin HTTPS client of the public API. It holds no state and
forwards the caller's `Authorization` header on every upstream request, so any
replica serves any request and keys never live on the server.

| Env var | Default | What |
|---|---|---|
| `YTS_API_BASE` | `https://api.youtubesearch.dev` | Upstream API base URL |
| `PORT` | `8000` | Listen port |

## Development

```bash
uv sync
uv run ruff format --check .
uv run ruff check .
uv run mypy
```

MIT © 2026 YouTubeSearch
