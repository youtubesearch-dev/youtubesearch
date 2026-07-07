# Wiring the hosted MCP server into your client

The hosted endpoint is `https://mcp.youtubesearch.dev/mcp` (Streamable HTTP).
It exposes four read-only tools: `search_videos`, `get_video`,
`get_transcript`, `get_summary`.

Auth is a standard `Authorization: Bearer ys_live_...` header. Omit it to run
keyless (cached content + search, rate-limited per IP). Free key — 1,000
credits/month — at [youtubesearch.dev](https://youtubesearch.dev).

## Claude Code

```bash
claude mcp add --transport http youtubesearch https://mcp.youtubesearch.dev/mcp \
  --header "Authorization: Bearer ys_live_..."   # omit --header for keyless
```

## Claude Desktop / claude.ai

Settings → Connectors → **Add custom connector**, then paste
`https://mcp.youtubesearch.dev/mcp` as the URL.

## Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "youtubesearch": {
      "url": "https://mcp.youtubesearch.dev/mcp",
      "headers": {
        "Authorization": "Bearer ys_live_..."
      }
    }
  }
}
```

## Stdio-only clients (via `mcp-remote`)

For clients that only speak stdio, bridge with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "youtubesearch": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.youtubesearch.dev/mcp",
        "--header",
        "Authorization: Bearer ys_live_..."
      ]
    }
  }
}
```

## Claude API (MCP connector — no client at all)

Your backend can hand the server straight to the Claude API and let tool calls
run server-side — see [`claude-agent.py`](./claude-agent.py) for a runnable
version:

```python
client.beta.messages.create(
    model="claude-opus-4-8",
    max_tokens=16000,
    betas=["mcp-client-2025-11-20"],
    mcp_servers=[{
        "type": "url",
        "url": "https://mcp.youtubesearch.dev/mcp",
        "name": "youtubesearch",
        "authorization_token": "ys_live_...",   # optional
    }],
    tools=[{"type": "mcp_toolset", "mcp_server_name": "youtubesearch"}],
    messages=[{"role": "user", "content": "..."}],
)
```
