# Notebook-Tools — OpenClaw Plugin Specification

> Plugin: `@kittipos/openclaw-notebook-tools`
> Version: 0.1.0
> Target: OpenClaw ≥ 2026.2, Node ≥ 22 (ESM, TypeScript)

## 1. Overview

`notebook-tools` is an OpenClaw tool plugin that gives the agent (Bernard) the ability to **read and edit Jupyter notebooks** (`.ipynb` files). OpenClaw's built-in `read` / `write` / `edit` tools treat notebooks as opaque JSON, which forces the agent to manipulate raw nbformat — error-prone, token-hungry, and easy to corrupt. This plugin provides a structured, cell-aware API.

### Goals (v0.1)

- Create new notebooks safely from structured cells.
- First-class read access to notebook cells with output-aware truncation.
- Fast discovery via cell listing and source search.
- Safe, atomic cell-level edits (replace, insert, delete, clear-outputs) with stale-edit protection.
- Stable addressing by **cell id** (nbformat 4.5+) with index fallback.
- Never corrupt a notebook: atomic writes, schema validation on save.
- Explicit notebook validation so agents can verify notebooks before claiming success.
- Ship a `SKILL.md` so the agent uses the tools correctly without prompting.

### Non-goals (v0.1)

- Kernel execution / running cells. (Future: optional v0.3 via `jupyter_client` over exec.)
- `.ipynb` ↔ `.py` conversion (jupytext).
- nbformat v3 or earlier.
- Multi-file batch operations.
- Multi-operation transactions. (Future: `notebook_apply_ops`.)
- GUI / preview rendering.

---

## 2. Architecture

```
@kittipos/openclaw-notebook-tools/
├── package.json
├── openclaw.plugin.json          # Plugin manifest
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── CLAUDE.md                     # Implementation guide for Claude Code
├── docs/
│   └── Notebook-Tools-Spec.md    # This file
├── index.ts                      # Plugin entry — definePluginEntry()
├── src/
│   ├── tools/                    # One file per tool, each exports register*()
│   │   ├── notebook_create.ts
│   │   ├── notebook_read.ts
│   │   ├── notebook_list_cells.ts
│   │   ├── notebook_search.ts
│   │   ├── notebook_edit_cell.ts
│   │   ├── notebook_insert_cell.ts
│   │   ├── notebook_delete_cell.ts
│   │   ├── notebook_clear_outputs.ts
│   │   └── notebook_validate.ts
│   ├── nb/                       # Notebook domain — pure, no SDK imports
│   │   ├── types.ts              # nbformat v4 typings
│   │   ├── load.ts               # parse + validate
│   │   ├── save.ts               # atomic write
│   │   ├── cell.ts               # resolveCell, normalizeSource, newCellId
│   │   ├── search.ts             # substring / regex search helpers
│   │   ├── hash.ts               # source hashes + stale-edit checks
│   │   ├── path.ts               # path normalization / ~ expansion
│   │   ├── outputs.ts            # truncation logic
│   │   └── errors.ts             # typed error classes
│   ├── skills/
│   │   └── notebook-tools/
│   │       └── SKILL.md
│   └── shared/
│       └── result.ts             # toolError() / toolText() helpers
└── tests/
    ├── fixtures/
    │   ├── minimal.ipynb
    │   ├── with_outputs.ipynb
    │   └── nbformat_v3.ipynb     # negative test
    ├── nb/
    │   ├── load.test.ts
    │   ├── save.test.ts
    │   └── cell.test.ts
    └── tools/
        ├── notebook_read.test.ts
        ├── notebook_edit_cell.test.ts
        └── (etc.)
```

### Layer rules (Clean Architecture)

```
┌──────────────────────────────────────────────┐
│  index.ts                  (Composition)     │
│   └─► registers tools with the SDK api       │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  src/tools/*.ts            (Adapters)        │
│   - own the TypeBox schemas                  │
│   - translate params → domain calls          │
│   - format domain results into ToolResult    │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  src/nb/*.ts               (Domain)          │
│   - pure notebook logic; no SDK imports      │
│   - throws typed errors from errors.ts       │
└──────────────────────────────────────────────┘
```

- **Domain (`src/nb/`) must not import from `openclaw/...`.** It only knows about notebooks. This keeps it unit-testable in isolation and replaceable.
- **Tools (`src/tools/`) are adapters.** They depend on the SDK and on the domain. They translate exceptions from the domain into structured tool errors — they never let exceptions escape.
- **Entry (`index.ts`) is composition only.** No business logic.

---

## 3. Tool Surface (v0.1)

| Tool                      | Side effect | Purpose                                      |
| ------------------------- | ----------- | -------------------------------------------- |
| `notebook_create`         | Yes         | Create a new notebook from structured cells  |
| `notebook_read`           | No          | Full or targeted structured read             |
| `notebook_list_cells`     | No          | Cheap index — id, type, preview, counts      |
| `notebook_search`         | No          | Find cells by source text / regex            |
| `notebook_edit_cell`      | Yes         | Replace a cell's source / type               |
| `notebook_insert_cell`    | Yes         | Insert a new cell at position                |
| `notebook_delete_cell`    | Yes         | Delete a cell by id or index                 |
| `notebook_clear_outputs`  | Yes         | Clear outputs (all or single cell)           |
| `notebook_validate`       | No          | Validate notebook structure and report facts |

> All 9 tools are registered as **required** so the plugin is batteries-included — installing it gives the agent the full read+edit surface with no extra `tools.allow` configuration. Safety comes from atomic writes, stale-edit guards (`expected_source_sha256`, `expected_file_mtime_ms`), and the SKILL.md workflow, not from a per-tool opt-in.
>
> All tools accept `~` in paths and return a normalized absolute path. Mutating tools write atomically (temp file → fsync → rename) and validate the notebook before replacing the original file.

### 3.1 `notebook_create`

**Description:** Create a new Jupyter notebook from structured cells. Use this when the user asks for a new notebook or an analysis scaffold. Do not overwrite an existing notebook unless `overwrite=true` is explicitly provided.

**Parameters (TypeBox):**

```ts
Type.Object({
  path:       Type.String({ description: "Path to create; may include ~; must end in .ipynb" }),
  cells:      Type.Optional(Type.Array(Type.Object({
                cell_type: Type.Union([
                  Type.Literal("code"),
                  Type.Literal("markdown"),
                  Type.Literal("raw"),
                ]),
                source:    Type.String({ default: "" }),
                metadata:  Type.Optional(Type.Record(Type.String(), Type.Unknown())),
              }), { default: [] })),
  kernel:     Type.Optional(Type.Object({
                name:         Type.String({ default: "python3" }),
                display_name: Type.String({ default: "Python 3" }),
                language:     Type.String({ default: "python" }),
              })),
  metadata:   Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  overwrite:  Type.Optional(Type.Boolean({ default: false })),
})
```

**Returns:** Path, cell count, generated cell ids, kernelspec, and whether an existing file was overwritten.

**Errors:** File already exists and `overwrite=false`, parent directory missing, invalid extension, invalid cell type.

### 3.2 `notebook_read`

**Description:** Read a Jupyter notebook and return its cells as structured data. Use this *before* editing when cell contents are needed.

**Parameters (TypeBox):**

```ts
Type.Object({
  path:             Type.String({ description: "Path to .ipynb; may include ~" }),
  include_outputs:  Type.Optional(Type.Boolean({ default: false })),
  max_output_chars: Type.Optional(Type.Integer({ default: 2000, minimum: 0 })),
  max_output_items: Type.Optional(Type.Integer({ default: 5, minimum: 0 })),
  cell_range:       Type.Optional(Type.Object({
    start: Type.Integer({ minimum: 0 }),
    end:   Type.Integer({ minimum: 0 }),     // exclusive
  })),
  cell_ids:         Type.Optional(Type.Array(Type.String())),
})
```

**Validation:** `cell_range` and `cell_ids` are mutually exclusive. If neither is provided, return all cells.

**Returns (text content, JSON-serialized):**

```jsonc
{
  "path": "/abs/path.ipynb",
  "mtime_ms": 1777137000000,
  "nbformat": 4,
  "nbformat_minor": 5,
  "metadata": { "kernelspec": { "name": "python3", "display_name": "Python 3" } },
  "cells": [
    {
      "index": 0,
      "id": "a1b2c3d4",
      "cell_type": "code",
      "source": "import pandas as pd\n",
      "source_sha256": "...",
      "line_count": 1,
      "execution_count": 1,
      "outputs_count": 1,
      "outputs": [                            // only when include_outputs=true
        { "output_type": "stream", "name": "stdout", "text": "ok\n" }
      ]
    }
  ]
}
```

**Errors:**

| Condition                         | Error message                                    |
| --------------------------------- | ------------------------------------------------ |
| File doesn't exist                | `Notebook not found: {path}`                     |
| Not valid JSON                    | `Invalid notebook: not parseable as JSON`        |
| nbformat < 4                      | `Unsupported nbformat: v{n}. Only v4 supported.` |
| `cell_range` out of bounds        | `cell_range out of bounds (notebook has N cells)` |
| Requested `cell_id` does not exist | `Cell not found: {cell_id}`                      |

### 3.3 `notebook_list_cells`

**Description:** Lightweight index of a notebook — one object per cell. Use when you only need to find the right cell to act on.

**Parameters:**

```ts
Type.Object({
  path:        Type.String(),
  preview_len: Type.Optional(Type.Integer({ default: 120, minimum: 0 })),
})
```

**Returns:**

```jsonc
{
  "path": "/abs/path.ipynb",
  "mtime_ms": 1777137000000,
  "cell_count": 12,
  "cells": [
    {
      "index": 0,
      "id": "a1b2c3d4",
      "cell_type": "markdown",
      "preview": "# My analysis",
      "source_chars": 187,
      "line_count": 8,
      "execution_count": null,
      "outputs_count": 0,
      "has_outputs": false,
      "tags": ["parameters"]
    },
    {
      "index": 1,
      "id": "e5f6g7h8",
      "cell_type": "code",
      "preview": "import pandas as pd",
      "source_chars": 19,
      "line_count": 1,
      "execution_count": 3,
      "outputs_count": 2,
      "has_outputs": true,
      "tags": []
    }
  ]
}
```

### 3.4 `notebook_search`

**Description:** Search cell sources and return matching cells with stable ids. Use this before editing when the target cell is known by text, heading, variable name, or code fragment.

**Parameters:**

```ts
Type.Object({
  path:          Type.String(),
  query:         Type.String(),
  regex:         Type.Optional(Type.Boolean({ default: false })),
  case_sensitive: Type.Optional(Type.Boolean({ default: false })),
  cell_type:     Type.Optional(Type.Union([
                   Type.Literal("code"),
                   Type.Literal("markdown"),
                   Type.Literal("raw"),
                 ])),
  max_matches:   Type.Optional(Type.Integer({ default: 20, minimum: 1 })),
  context_lines: Type.Optional(Type.Integer({ default: 1, minimum: 0, maximum: 5 })),
})
```

**Returns:**

```jsonc
{
  "path": "/abs/path.ipynb",
  "query": "train_test_split",
  "matches": [
    {
      "index": 4,
      "id": "a1b2c3d4",
      "cell_type": "code",
      "line": 12,
      "preview": "from sklearn.model_selection import train_test_split",
      "context": ["# split data", "from sklearn.model_selection import train_test_split", "X_train, X_test = ..."]
    }
  ]
}
```

### 3.5 `notebook_edit_cell`

**Description:** Replace the source of a single cell. Optionally change cell type. Editing a code cell automatically clears its outputs and `execution_count`.

**Parameters:**

```ts
Type.Object({
  path:                   Type.String(),
  cell_id:                Type.Optional(Type.String()),                                  // preferred
  index:                  Type.Optional(Type.Integer({ minimum: 0 })),                   // fallback
  new_source:             Type.String(),
  new_cell_type:          Type.Optional(Type.Union([
                            Type.Literal("code"),
                            Type.Literal("markdown"),
                            Type.Literal("raw"),
                          ])),
  expected_source_sha256: Type.Optional(Type.String()),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
})
```

**Validation:** Exactly one of `cell_id` or `index` must be provided. If `expected_source_sha256` or `expected_file_mtime_ms` is provided and does not match the current notebook, fail without writing.

**Returns:**

```
Edited cell {id} (was index {n}). cell_type=code. Source: 156 → 203 chars. Outputs cleared. New source_sha256={sha}.
```

**Errors:** `cell_id` not found, `index` out of bounds, both/neither provided, stale source hash, stale file mtime.

### 3.6 `notebook_insert_cell`

**Description:** Insert a new cell. Position is specified relative to an anchor cell (`before` / `after` an `anchor_id` or `anchor_index`), or at an absolute `position`. New cells get a freshly generated id.

**Parameters:**

```ts
Type.Object({
  path:                   Type.String(),
  cell_type:              Type.Union([
                            Type.Literal("code"),
                            Type.Literal("markdown"),
                            Type.Literal("raw"),
                          ]),
  source:                 Type.String({ default: "" }),
  metadata:               Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  position:               Type.Optional(Type.Integer({ minimum: 0 })),
  anchor_id:              Type.Optional(Type.String()),
  anchor_index:           Type.Optional(Type.Integer({ minimum: 0 })),
  placement:              Type.Optional(Type.Union([
                            Type.Literal("before"),
                            Type.Literal("after"),
                          ], { default: "after" })),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
})
```

**Validation:** Exactly one of `{position}`, `{anchor_id}`, or `{anchor_index}` must be provided. `placement` only applies to anchor-based insertion. If `expected_file_mtime_ms` is provided and does not match, fail without writing.

**Returns:** New cell id, final index, and updated cell count.

### 3.7 `notebook_delete_cell`

**Parameters:**

```ts
Type.Object({
  path:                   Type.String(),
  cell_id:                Type.Optional(Type.String()),
  index:                  Type.Optional(Type.Integer({ minimum: 0 })),
  expected_source_sha256: Type.Optional(Type.String()),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
})
```

**Validation:** Exactly one of `cell_id` / `index`. If stale guards are provided and do not match, fail without writing.
**Returns:** Confirms deleted cell id, previous index, and remaining cell count.

### 3.8 `notebook_clear_outputs`

**Description:** Clear cell outputs. Either all code cells, or a specific one.

**Parameters:**

```ts
Type.Object({
  path:                   Type.String(),
  cell_id:                Type.Optional(Type.String()),
  index:                  Type.Optional(Type.Integer({ minimum: 0 })),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
  // If neither cell_id nor index is provided, clears ALL code cell outputs.
})
```

**Validation:** If both `cell_id` and `index` are provided, fail. If stale guards are provided and do not match, fail without writing.
**Returns:** Count of cells affected and cleared output count.

### 3.9 `notebook_validate`

**Description:** Validate notebook JSON and nbformat assumptions without changing the file. Use after mutations as a cheap verification gate.

**Parameters:**

```ts
Type.Object({
  path: Type.String(),
})
```

**Returns:**

```jsonc
{
  "path": "/abs/path.ipynb",
  "valid": true,
  "nbformat": 4,
  "nbformat_minor": 5,
  "cell_count": 12,
  "missing_cell_ids_backfillable": 0,
  "warnings": []
}
```

**Errors:** Invalid JSON, unsupported nbformat, invalid `cells` structure. This tool should return `valid=false` with details for expected validation failures rather than throwing an uncaught exception.

---

## 4. Internal Modules

### 4.1 `src/nb/types.ts`

Mirror nbformat v4 minimally — don't pull in `@jupyterlab/nbformat`. Hand-rolled types are smaller and we control the shape.

```ts
export interface Notebook {
  nbformat: 4;
  nbformat_minor: number;          // ≥ 5 preferred
  metadata: NotebookMetadata;
  cells: Cell[];
}

export type Cell = CodeCell | MarkdownCell | RawCell;

export interface CodeCell {
  cell_type: "code";
  id: string;
  source: string | string[];
  metadata: Record<string, unknown>;
  execution_count: number | null;
  outputs: CellOutput[];
}

export interface MarkdownCell {
  cell_type: "markdown";
  id: string;
  source: string | string[];
  metadata: Record<string, unknown>;
  attachments?: Record<string, unknown>;
}

export interface RawCell { /* analogous */ }

export type CellOutput =
  | { output_type: "stream"; name: "stdout" | "stderr"; text: string | string[] }
  | { output_type: "display_data"; data: Record<string, unknown>; metadata: Record<string, unknown> }
  | { output_type: "execute_result"; data: Record<string, unknown>; metadata: Record<string, unknown>; execution_count: number | null }
  | { output_type: "error"; ename: string; evalue: string; traceback: string[] };
```

### 4.2 `src/nb/load.ts`

```ts
export async function loadNotebook(path: string): Promise<Notebook>;
export async function createNotebook(options: CreateNotebookOptions): Promise<Notebook>;
export function validateNotebookShape(value: unknown): ValidationResult;
```

- Reads file as UTF-8 → `JSON.parse`.
- Throws `NotebookNotFoundError` if file missing (ENOENT).
- Throws `InvalidNotebookError` if JSON parse fails.
- Throws `UnsupportedNbformatError` if `nbformat !== 4`.
- Validates `cells` is an array and each cell has a supported `cell_type`.
- **Backfills missing cell ids** (older notebooks may lack them) using `nanoid(8)` — write-back happens only when the caller saves.
- `createNotebook` builds a minimal nbformat v4 notebook with generated cell ids, default metadata, optional kernelspec, and empty code-cell outputs.

### 4.3 `src/nb/save.ts`

```ts
export async function saveNotebook(path: string, nb: Notebook): Promise<void>;
```

**Atomic write protocol:**

```
1. JSON.stringify(nb, null, 1)            // 1-space indent — nbformat convention
2. Write to `${path}.tmp-${pid}-${ts}`
3. fsync the temp file handle
4. fs.rename(temp, path)                  // POSIX-atomic on same filesystem
5. On any failure, attempt to unlink the temp file
```

This prevents partial writes from corrupting the user's notebook (e.g., if the agent or process is killed mid-edit).

### 4.4 `src/nb/cell.ts`

```ts
export function resolveCellRef(
  nb: Notebook,
  ref: { cell_id?: string; index?: number }
): { cell: Cell; index: number };

export function normalizeSourceIn(source: string): string[];
//   Splits a string source into the line-array form Jupyter prefers,
//   keeping trailing newlines on each line.

export function normalizeSourceOut(source: string | string[]): string;
//   Joins array form back into a single string for tool consumers.

export function newCellId(): string;     // nanoid-style, 8 chars [a-zA-Z0-9]
```

### 4.5 `src/nb/search.ts`

```ts
export function searchCells(nb: Notebook, options: SearchOptions): SearchMatch[];
```

- Supports literal substring search and JavaScript regex search.
- Returns stable cell ids, current indexes, 1-based line numbers, previews, and optional context lines.
- Applies `cell_type`, `case_sensitive`, and `max_matches` filters in the domain layer.

### 4.6 `src/nb/hash.ts`

```ts
export function sourceSha256(cell: Cell): string;
export function assertFreshFile(actualMtimeMs: number, expected?: number): void;
export function assertFreshSource(cell: Cell, expected?: string): void;
```

- Used by mutating tools to avoid overwriting human edits made after the agent listed/read the notebook.
- Stale guards are optional, but tool adapters should pass them through whenever the agent provides them.

### 4.7 `src/nb/path.ts`

```ts
export function normalizeNotebookPath(path: string): string;
export function assertIpynbExtension(path: string): void;
```

- Expands leading `~` to the user's home directory.
- Resolves relative paths against the current working directory.
- Returns normalized absolute paths in all tool responses.

### 4.8 `src/nb/outputs.ts`

`truncateOutputs(outputs, { maxChars, maxItems })`:

- Take at most `maxItems` outputs; replace overflow with a placeholder count.
- For each:
  - `stream` / `text/plain`: truncate to `maxChars`, append `…[truncated]`.
  - `image/png`, `image/jpeg`, `image/svg+xml`: replace with `<image: {n} bytes elided>`.
  - `application/json`: `JSON.stringify` then truncate.
  - `application/vnd.*`: replace with `<{mime}: elided>`.

### 4.9 `src/nb/errors.ts`

```ts
export class NotebookError extends Error { code: string }
export class NotebookNotFoundError extends NotebookError {}
export class NotebookAlreadyExistsError extends NotebookError {}
export class InvalidNotebookError extends NotebookError {}
export class UnsupportedNbformatError extends NotebookError {}
export class CellNotFoundError extends NotebookError {}
export class InvalidParametersError extends NotebookError {}
export class StaleNotebookError extends NotebookError {}
```

---

## 5. Cell Addressing Strategy

### Rule

> **Always prefer `cell_id`. Use `index` only when no id is available** (e.g., the agent just listed cells and is acting immediately, or the notebook is too old to have ids).

### Why

Indexes shift after every insert/delete. A multi-step edit plan that addresses cells by index is fragile:

```
Plan: "delete cell 3, then edit cell 4"
After delete: original cell 4 is now at index 3
Result: agent edits the wrong cell. Bug.
```

Cell ids are stable across the entire session.

### Implementation

- `resolveCellRef` accepts `{ cell_id?, index? }` and returns the resolved cell + its current index.
- All mutating tools call `resolveCellRef` and report **both** id and resulting index in the response, so the agent can update its mental map.
- `notebook_list_cells`, `notebook_search`, and `notebook_read` always return `id` for every cell — this teaches the agent the canonical reference style by example.
- `notebook_read` returns `source_sha256`; mutating tools can use it as an optional stale-edit guard.

---

## 6. Output Truncation Rules

Defaults are conservative. Total budget per `notebook_read` call:

```
max_output_items     = 5    (per cell)
max_output_chars     = 2000 (per output, before truncation marker)
```

These are exposed as parameters so the agent can request more when needed. **Outputs are off by default** in `notebook_read` — most tasks don't need them, and they explode token usage.

---

## 7. Stale-Edit Safety

Notebook files are often open in VS Code, JupyterLab, or another agent session. v0.1 should avoid silent overwrites.

- `notebook_read` / `notebook_list_cells` return `mtime_ms` and per-cell `source_sha256`.
- `notebook_edit_cell` and `notebook_delete_cell` accept `expected_source_sha256`.
- All mutating tools accept `expected_file_mtime_ms`.
- If a stale guard is supplied and no longer matches, the tool fails with `StaleNotebookError` and does not write.
- Agents should prefer `cell_id + expected_source_sha256` for precise edits, and use `expected_file_mtime_ms` when changing notebook structure.

---

## 8. Error Model

Tools never let exceptions escape. Convert in the adapter layer:

```ts
async execute(_id, params) {
  try {
    /* ... domain calls ... */
    return toolText("Edited cell ...");
  } catch (e) {
    if (e instanceof CellNotFoundError) return toolError(e.message);
    if (e instanceof NotebookNotFoundError) return toolError(e.message);
    api.logger.error("notebook_edit_cell unexpected", e);
    return toolError(`Internal error: ${(e as Error).message}`);
  }
}
```

`toolError(msg)` returns `{ content: [{ type: "text", text: msg }], isError: true }`.

---

## 9. Plugin Manifest & Registration

### `openclaw.plugin.json`

```json
{
  "id": "notebook-tools",
  "name": "Jupyter Notebook Tools",
  "version": "0.1.0",
  "description": "Read and edit Jupyter notebooks (.ipynb)",
  "capabilities": ["tools"],
  "skills": ["./src/skills/notebook-tools"]
}
```

### `index.ts`

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerNotebookCreate } from "./src/tools/notebook_create.js";
import { registerNotebookRead } from "./src/tools/notebook_read.js";
import { registerNotebookListCells } from "./src/tools/notebook_list_cells.js";
import { registerNotebookSearch } from "./src/tools/notebook_search.js";
import { registerNotebookEditCell } from "./src/tools/notebook_edit_cell.js";
import { registerNotebookInsertCell } from "./src/tools/notebook_insert_cell.js";
import { registerNotebookDeleteCell } from "./src/tools/notebook_delete_cell.js";
import { registerNotebookClearOutputs } from "./src/tools/notebook_clear_outputs.js";
import { registerNotebookValidate } from "./src/tools/notebook_validate.js";

export default definePluginEntry({
  id: "notebook-tools",
  name: "Jupyter Notebook Tools",
  version: "0.1.0",
  description: "Read and edit .ipynb files",
  register(api) {
    registerNotebookCreate(api);
    registerNotebookRead(api);
    registerNotebookListCells(api);
    registerNotebookSearch(api);
    registerNotebookEditCell(api);
    registerNotebookInsertCell(api);
    registerNotebookDeleteCell(api);
    registerNotebookClearOutputs(api);
    registerNotebookValidate(api);
    api.logger.info("notebook-tools v0.1.0 — 9 tools registered");
  },
});
```

---

## 10. SKILL.md (shipped with plugin)

```md
---
name: notebook-tools
description: |
  Use these tools whenever the user asks to read, modify, or clean up
  Jupyter notebooks (.ipynb files). Do NOT use the generic read/write/edit
  tools on .ipynb files — they will corrupt the notebook structure.
---

# Working with Jupyter Notebooks

## Workflow

1. **Create with `notebook_create`.** Do not hand-write notebook JSON.
2. **Start by listing or searching.** Call `notebook_list_cells` for an overview
   or `notebook_search` when the target cell is known by text. Both return
   stable cell ids.
3. **Read targeted cells.** If you need source content, call `notebook_read`
   with `cell_ids`, `cell_range`, or `include_outputs` only when needed.
4. **Address by `cell_id`, not `index`.** After any insert/delete, indexes
   shift. Cell ids are stable across operations.
5. **Use stale guards when available.** Pass `expected_source_sha256` or
   `expected_file_mtime_ms` from the latest read/list/search result before
   mutating.
6. **Edit, don't rewrite.** Use `notebook_edit_cell` for source changes,
   `notebook_insert_cell` to add cells, and `notebook_validate` after changes.

## After mutations

- Editing a code cell automatically clears its outputs. Mention this in your
  reply.
- Tell the user the new cell id when you insert.
- If the user asked for a "clean notebook", run `notebook_clear_outputs`
  with no `cell_id` to clear all outputs at once.
- Run `notebook_validate` before claiming that a changed notebook is valid.

## Don't

- Don't use `read` / `write` / `edit` core tools on `.ipynb` files.
- Don't try to execute cells — that's not supported. Suggest the user run
  the notebook in JupyterLab themselves.
- Don't address cells by index across multiple tool calls — always re-list
  or use ids.
```

---

## 11. Testing

Vitest. Coverage targets:

- `src/nb/load.ts`: valid notebook, create notebook, missing file, malformed JSON, nbformat v3, missing cells array.
- `src/nb/save.ts`: round-trip preserves bytes (modulo formatting), atomicity (kill mid-write doesn't corrupt — simulate via mock).
- `src/nb/cell.ts`: resolve by id, resolve by index, both provided → throws, neither → throws.
- `src/nb/search.ts`: literal/regex search, case sensitivity, max matches, context lines.
- `src/nb/hash.ts`: stable source hashes and stale-guard failures.
- `src/nb/path.ts`: `~` expansion, absolute normalization, `.ipynb` extension checks.
- `src/nb/outputs.ts`: truncation of stream / image / json / oversized list.
- Each tool: happy path + 2 error paths.

Fixtures live in `tests/fixtures/`. Don't commit large notebooks — keep fixtures < 5 KB.

---

## 12. Build & Install

```bash
pnpm install
pnpm build              # tsc → dist/
pnpm test               # vitest

# Local dev install (point OpenClaw at the repo)
openclaw plugins install /absolute/path/to/repo

# Verify
openclaw plugins list   # should show notebook-tools
openclaw gateway restart
```

All 9 tools are always-on after install — no `tools.allow` configuration needed. The plugin is intentionally batteries-included.

---

## 13. Acceptance Criteria

A v0.1 release is ready when:

- [x] All 9 tools listed by `openclaw plugins list` after install. *(install log: "notebook-tools v0.1.0 — 9 tools registered"; after dropping `{ optional: true }`, all 9 are agent-visible without `tools.allow`)*
- [ ] `notebook_create` creates notebooks that open cleanly in JupyterLab / VS Code. *(unit test verifies JSON parses + nbformat shape; needs end-to-end open in JupyterLab)*
- [x] `notebook_read` round-trips every fixture without modification. *(`tests/nb/save.test.ts` round-trip)*
- [x] `notebook_search` finds code and markdown matches by stable cell id. *(`tests/nb/search.test.ts` + `tests/tools/notebook_search.test.ts`)*
- [ ] Edits via `notebook_edit_cell` produce notebooks that open cleanly in JupyterLab. *(unit tests verify edits load through our own loader; needs JupyterLab open)*
- [x] Cell-id-based addressing works correctly across an insert + delete sequence. *(`tests/nb/cell.test.ts`, `tests/tools/notebook_insert_cell.test.ts`, `tests/tools/notebook_delete_cell.test.ts`)*
- [x] Stale guards prevent overwriting when `mtime_ms` or `source_sha256` no longer matches. *(`tests/nb/hash.test.ts` + `tests/tools/notebook_edit_cell.test.ts` + `tests/tools/notebook_delete_cell.test.ts`)*
- [x] Atomic save: simulated mid-write failure leaves the original file intact. *(`tests/nb/save.test.ts` "does not corrupt the original file when rename fails")*
- [x] `notebook_validate` reports `valid=true` for all positive fixtures and useful errors for negative fixtures. *(`tests/tools/notebook_validate.test.ts`)*
- [x] All tests pass with `pnpm test`. *(82/82 green)*
- [x] `pnpm build` produces a clean `dist/` with no TS errors under `strict: true`. *(strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes; no `any`)*
- [ ] SKILL.md is loaded into the agent system prompt when tools are active (verify in OpenClaw logs). *(SKILL.md ships in tarball; load needs verification via gateway logs)*

---

## 14. Roadmap (v0.2+)

- `notebook_apply_ops` — atomic multi-operation transaction for multi-cell edits.
- `notebook_move_cell` — reorder.
- `notebook_metadata` — get/set notebook- and cell-level metadata (kernelspec, tags).
- `notebook_split_cell` / `notebook_merge_cells` — convenience editing.
- `.ipynb` ↔ `.py` / `.qmd` conversion via jupytext.
- (v0.3) Optional `notebook_execute_cell` via subprocess `jupyter nbconvert --execute` or `jupyter_client` — gated behind `optional: true` and an explicit config flag.
