// Human-readable rendering for stdout (plain text, no colors — agent-friendly).

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict {
  return value !== null && typeof value === "object" ? (value as Dict) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function formatDuration(seconds: unknown): string | undefined {
  const total = num(seconds);
  if (total === undefined) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatViews(count: unknown): string | undefined {
  const n = num(count);
  return n === undefined ? undefined : `${n.toLocaleString("en-US")} views`;
}

export function renderSearch(result: unknown): string {
  const videos = asDict(result).videos;
  if (!Array.isArray(videos) || videos.length === 0) return "No results.\n";
  const blocks = videos.map((entry, i) => {
    const v = asDict(entry);
    const lines = [`${i + 1}. ${str(v.title) ?? "(untitled)"}`];
    const meta = [str(v.channel), formatDuration(v.duration_s), formatViews(v.view_count), str(v.published)]
      .filter((part): part is string => part !== undefined)
      .join(" | ");
    if (meta) lines.push(`   ${meta}`);
    if (str(v.youtube_id)) lines.push(`   https://youtu.be/${v.youtube_id}`);
    if (str(v.description_snippet)) lines.push(`   ${v.description_snippet}`);
    return lines.join("\n");
  });
  return blocks.join("\n\n") + "\n";
}

export function renderVideo(result: unknown): string {
  const v = asDict(result);
  const lines = [str(v.title) ?? "(untitled)"];
  const published = str(v.published_at);
  const meta = [
    str(v.channel),
    formatDuration(v.duration_s),
    formatViews(v.view_count),
    published ? `published ${published.slice(0, 10)}` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" | ");
  if (meta) lines.push(meta);
  if (str(v.youtube_id)) lines.push(`https://youtu.be/${v.youtube_id}`);
  const description = str(v.description);
  if (description) lines.push("", description.trim());
  if (Array.isArray(v.chapters) && v.chapters.length > 0) {
    lines.push("", "Chapters:");
    for (const entry of v.chapters) {
      const chapter = asDict(entry);
      const at = formatDuration(chapter.start_s) ?? "?";
      lines.push(`  [${at}] ${str(chapter.title) ?? ""}`.trimEnd());
    }
  }
  return lines.join("\n") + "\n";
}

export function renderSummary(result: unknown): string {
  const sections = asDict(asDict(result).sections);
  const entries = Object.entries(sections);
  if (entries.length === 0) return "No sections returned.\n";
  const blocks = entries.map(([name, value]) => `## ${titleCase(name)}\n\n${renderSectionValue(value)}`);
  return blocks.join("\n\n") + "\n";
}

function titleCase(name: string): string {
  return name
    .split("_")
    .map((word) => (word === "" ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(" ");
}

function renderSectionValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => `- ${renderListItem(item)}`).join("\n");
  }
  return JSON.stringify(value, null, 2);
}

function renderListItem(item: unknown): string {
  if (typeof item === "string") return item;
  const o = asDict(item);
  // timestamps section: {time, description}
  if (str(o.time) && str(o.description)) return `[${o.time}] ${o.description}`;
  // resources section: {name, url, ...}
  if (str(o.name)) return str(o.url) ? `${o.name} (${o.url})` : `${o.name}`;
  return JSON.stringify(item);
}

export function renderCredits(result: unknown): string {
  const c = asDict(result);
  const lines = [
    `Tier: ${str(c.tier) ?? "unknown"}`,
    `Monthly allowance: ${num(c.monthly_allowance) ?? "?"} credits`,
    `Used this month: ${num(c.used_this_month) ?? "?"}`,
    `Remaining: ${num(c.remaining) ?? "?"}`,
  ];
  return lines.join("\n") + "\n";
}
