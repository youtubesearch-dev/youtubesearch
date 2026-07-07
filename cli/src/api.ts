// Fetch wrapper for the YouTubeSearch REST API + typed error handling.

const DEFAULT_BASE = "https://api.youtubesearch.dev";

export function apiBase(): string {
  const override = process.env.YOUTUBESEARCH_API_BASE;
  const base = override && override.trim() !== "" ? override.trim() : DEFAULT_BASE;
  return base.replace(/\/+$/, "");
}

/** An error response from the API (wire format {error, message}) or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export async function apiRequest(
  path: string,
  key: string | undefined,
  options: RequestOptions = {},
): Promise<unknown> {
  const url = new URL(apiBase() + path);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new ApiError("NETWORK", describeFetchError(err), 0);
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text === "" ? undefined : JSON.parse(text);
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const body = (data ?? {}) as Record<string, unknown>;
    const code = typeof body.error === "string" ? body.error : `HTTP_${res.status}`;
    const message =
      typeof body.message === "string" ? body.message : text || res.statusText || "request failed";
    throw new ApiError(code, message, res.status, res.headers.get("retry-after"));
  }
  return data;
}

function describeFetchError(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause;
    const causeMessage = cause instanceof Error ? cause.message : undefined;
    return causeMessage ? `${err.message} (${causeMessage})` : err.message;
  }
  return String(err);
}
