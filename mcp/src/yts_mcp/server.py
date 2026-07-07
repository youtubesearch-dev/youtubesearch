"""YouTubeSearch MCP server — the four operations as read-only tools.

Deliberately a thin HTTPS client of the public YouTubeSearch API — no
private imports, nothing closed-source behind it. Stateless Streamable
HTTP with JSON responses: any replica serves any request, and the client's
Authorization header is forwarded per request (keyless works too — cached
content only).
"""

import os
from typing import Any, Literal

import httpx
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations
from starlette.requests import Request
from starlette.responses import JSONResponse

API_BASE = os.environ.get("YTS_API_BASE", "https://api.youtubesearch.dev")
REQUEST_TIMEOUT_S = 300  # cold summaries take ~15s; ASR transcripts take minutes

mcp = FastMCP(
    "youtubesearch",
    instructions=(
        "Clean YouTube data for AI agents: search videos, read metadata, pull "
        "timestamped transcripts and structured summaries. Without an API key "
        "you get cached content only; connect with an "
        "'Authorization: Bearer ys_live_...' header for full access "
        "(free tier: 1,000 credits/month)."
    ),
    stateless_http=True,
    json_response=True,
    host="0.0.0.0",
    port=int(os.environ.get("PORT", "8000")),
)

READ_ONLY = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True
)


def _auth_headers(ctx: Context) -> dict[str, str]:  # type: ignore[type-arg]
    request = ctx.request_context.request
    if request is None:
        return {}
    auth = request.headers.get("authorization")
    return {"Authorization": auth} if auth else {}


async def _call(
    ctx: Context,  # type: ignore[type-arg]
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(base_url=API_BASE, timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.request(
                method, path, params=params, json=json_body, headers=_auth_headers(ctx)
            )
    except httpx.HTTPError as exc:
        # Keep the typed-message contract even on transport failures; httpx
        # messages never include the forwarded Authorization header.
        raise RuntimeError(f"UPSTREAM_UNREACHABLE: {type(exc).__name__} calling the API.") from exc
    try:
        body: dict[str, Any] = resp.json()
    except ValueError as exc:
        raise RuntimeError(f"API returned non-JSON (HTTP {resp.status_code}).") from exc
    if resp.status_code >= 400:
        # Surface the API's typed, honest error verbatim to the agent.
        raise RuntimeError(f"{body.get('error', 'ERROR')}: {body.get('message', '')}")
    return body


@mcp.tool(
    annotations=READ_ONLY,
    description=(
        "Search YouTube. Returns top videos with native metadata (title, channel, "
        "duration_s, view_count, published, thumbnail, description snippet) plus a "
        "cached executive summary when one exists. Costs 1 credit per query."
    ),
)
async def search_videos(
    query: str,
    ctx: Context,  # type: ignore[type-arg]
    limit: int = 10,
    duration: Literal["short", "medium", "long"] | None = None,
    recency: Literal["hour", "day", "week", "month", "year"] | None = None,
    channel: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"query": query, "limit": limit}
    filters = {
        k: v for k, v in (("duration", duration), ("recency", recency), ("channel", channel)) if v
    }
    if filters:
        body["filters"] = filters
    return await _call(ctx, "POST", "/v1/search", json_body=body)


@mcp.tool(
    annotations=READ_ONLY,
    description=(
        "Video metadata: title, channel, duration, views, publish date, full "
        "description, and chapters. Costs 1 credit."
    ),
)
async def get_video(youtube_id: str, ctx: Context) -> dict[str, Any]:  # type: ignore[type-arg]
    return await _call(ctx, "GET", f"/v1/videos/{youtube_id}")


@mcp.tool(
    annotations=READ_ONLY,
    description=(
        "Timestamped transcript of a video. Every video returns a transcript "
        "(captions, or speech-to-text fallback when captions are disabled). "
        "format=markdown gives sparse [mm:ss] paragraphs (best for LLMs); "
        "start/end select a time window in seconds; max_tokens caps the size. "
        "Costs 1 credit cached, 2 cold, 10 when speech-to-text runs."
    ),
)
async def get_transcript(
    youtube_id: str,
    ctx: Context,  # type: ignore[type-arg]
    format: Literal["markdown", "json", "plain"] = "markdown",
    start: float | None = None,
    end: float | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"format": format}
    if start is not None:
        params["start"] = start
    if end is not None:
        params["end"] = end
    if max_tokens is not None:
        params["max_tokens"] = max_tokens
    return await _call(ctx, "GET", f"/v1/videos/{youtube_id}/transcript", params=params)


@mcp.tool(
    annotations=READ_ONLY,
    description=(
        "Structured summary of a video: executive_summary, key_points, "
        "detailed_summary, insights, timestamps, action_items, resources. "
        "Select fields with sections (comma-separated) to save tokens. "
        "Costs 1 credit cached, 5 cold."
    ),
)
async def get_summary(
    youtube_id: str,
    ctx: Context,  # type: ignore[type-arg]
    sections: str | None = None,
) -> dict[str, Any]:
    params = {"sections": sections} if sections else None
    return await _call(ctx, "GET", f"/v1/videos/{youtube_id}/summary", params=params)


@mcp.custom_route("/health", methods=["GET"])  # type: ignore[untyped-decorator]  # SDK decorator is untyped
async def health(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
