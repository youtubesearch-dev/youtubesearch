#!/usr/bin/env python3
"""A Claude agent that researches a YouTube video via the hosted MCP server.

Claude connects to https://mcp.youtubesearch.dev/mcp through the Claude API's
MCP connector — the tool calls (search_videos, get_transcript, ...) run
server-side, so there is no client-side tool loop to write.

Setup:
    pip install anthropic
    export ANTHROPIC_API_KEY=sk-ant-...
    export YOUTUBESEARCH_API_KEY=ys_live_...   # optional; keyless = cached content only

Run:
    python claude-agent.py
"""

import os

import anthropic

MCP_URL = "https://mcp.youtubesearch.dev/mcp"

TASK = (
    "Find Andrej Karpathy's talk 'Intro to Large Language Models' on YouTube, "
    "then pull the transcript for its 'Tool Use' chapter (roughly 27:43-33:32) "
    "and list each tool he demonstrates there, with the timestamp where it "
    "first comes up."
)


def main() -> None:
    client = anthropic.Anthropic()

    server: dict[str, str] = {
        "type": "url",
        "url": MCP_URL,
        "name": "youtubesearch",
    }
    # Keyless works on cached content; a key unlocks everything (free tier:
    # 1,000 credits/month at https://youtubesearch.dev).
    if api_key := os.environ.get("YOUTUBESEARCH_API_KEY"):
        server["authorization_token"] = api_key

    messages: list[dict] = [{"role": "user", "content": TASK}]

    while True:
        response = client.beta.messages.create(
            model="claude-opus-4-8",
            max_tokens=16000,
            betas=["mcp-client-2025-11-20"],
            mcp_servers=[server],
            tools=[{"type": "mcp_toolset", "mcp_server_name": "youtubesearch"}],
            messages=messages,
        )

        for block in response.content:
            if block.type == "mcp_tool_use":
                print(f"[tool] {block.name} {block.input}")
            elif block.type == "text":
                print(block.text)

        # Server-side tools hit the per-request iteration limit; re-send the
        # conversation and the API resumes where it left off.
        if response.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": response.content})
            continue
        break


if __name__ == "__main__":
    main()
