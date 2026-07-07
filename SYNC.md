# SYNC.md — keeping this repo in sync with upstream

The `mcp/` and `cli/` packages here are extracted from a private monorepo,
which remains the source of truth. Syncs should be mechanical: copy the
package sources over, then re-apply the deliberate divergences below.

## Divergences from the monorepo (re-apply on every sync)

### mcp/

| File | Change | Why |
|---|---|---|
| `src/yts_mcp/server.py` | Module docstring: removed an internal decision-log reference | Internal doc reference; the extraction has happened |
| `src/yts_mcp/server.py` | `API_BASE` default: pre-cutover deploy hostname → `https://api.youtubesearch.dev` | Public domain (post-cutover); no deploy hostnames in public code |
| `pyproject.toml` | `version = "0.1.1"` (monorepo: `0.1.0`) | Marks the new default base URL |
| `pyproject.toml` | Added `readme`, `license = "MIT"`, and `[project.urls]` | Public-package metadata |
| `uv.lock` | Regenerated (`uv lock`) after the pyproject change | Keeps `uv sync --locked` green |
| `README.md` | New file (public package readme) | Does not exist upstream |

### cli/

| File | Change | Why |
|---|---|---|
| `src/api.ts` | `DEFAULT_BASE`: pre-cutover deploy hostname → `https://api.youtubesearch.dev` | Public domain (post-cutover); no deploy hostnames in public code |
| `package.json` | `name`: `youtubesearch` → `@youtubesearch/cli`; `version` `0.1.0` → `0.1.2` | Publishes under the npm org scope. 0.1.1 = new default base URL; 0.1.2 = republish under the persona npm account (`dylanatexe`), no functional change (D-032 pseudonymity) |
| `package.json` | Added `homepage`, `repository`, `bugs`, `publishConfig.access: public`, and a `typecheck` script | Public-package metadata; scoped packages default to restricted; CI runs typecheck |
| `package-lock.json` | Regenerated (`npm install --package-lock-only`) after the rename | `npm ci` validates name/version against the lockfile |
| `README.md` | New file (public package readme, used by npm) | Does not exist upstream |

### Repo-only files (no upstream counterpart)

`README.md` (root), `LICENSE`, `SYNC.md`, `.gitignore`,
`.github/workflows/ci.yml`, `examples/`.

The CI workflow mirrors the monorepo's `mcp` job (uv + ruff format/check +
mypy) and adds a `cli` job (npm ci + typecheck + build + smoke `--help`).

## Sync procedure

1. Copy `mcp/pyproject.toml`, `mcp/src/`, `cli/src/`, `cli/tsconfig.json`,
   `cli/package.json` from the monorepo (never `.env`, caches, `dist/`,
   `node_modules/`).
2. Re-apply every divergence in the tables above.
3. Regenerate lockfiles: `cd mcp && uv lock`; `cd cli && npm install
   --package-lock-only`.
4. Security sweep before committing — grep the tree for key prefixes
   (`ys_live_` followed by anything other than `...` placeholders), `sk-`,
   analytics tokens, deploy/infra hostnames, and any internal repo paths or
   decision-log references.
5. Build + run both packages against production (keyless works: video
   `zjkBMFhNj_g` is permanently cached).
