# OpenClaw Notebook Tools

`@kittipos/openclaw-notebook-tools` — OpenClaw plugin, 9 tools for reading/editing Jupyter notebooks. Behavioral spec: `docs/Notebook-Tools-Spec.md`. This file is the **how to implement it** doc.

## Stack

Node ≥ 22, TypeScript strict ESM, `@sinclair/typebox`, `nanoid`, Vitest. `openclaw` is a peer dep. No `@jupyterlab/nbformat` — types are hand-rolled in `src/nb/types.ts`.

## Architecture (non-negotiable)

```
index.ts        →  composition only (register tools)
src/tools/*.ts  →  adapters (TypeBox schemas, throw on failure)
src/nb/*.ts     →  pure domain (no SDK imports, throws typed errors)
```

1. **`src/nb/` MUST NOT import from `openclaw/...`.** If you want an SDK type in `src/nb/`, the abstraction is wrong.
2. **`src/tools/` is the only layer that knows the SDK.** Each `execute()` body wraps domain calls in `try/catch` and **re-throws typed `NotebookError`s**. The SDK converts thrown errors into structured tool error results.
3. **`index.ts` is composition only.**

## SDK contract (verified against `openclaw@2026.4.23`)

- Import from **`openclaw/plugin-sdk/core`** — re-exports `definePluginEntry`, `OpenClawPluginApi`, `jsonResult`, `readStringParam`, etc. (Built-in extensions like `firecrawl` import from here.) Avoid `openclaw/plugin-sdk` (deprecated monolithic root).
- `AgentTool { label: string }` — `label` is **required**. Don't omit it.
- `AgentToolResult = { content, details, terminate? }` — there is **no `isError` field**. Throw on failure; the SDK wraps the thrown error.
- `execute(toolCallId, params, signal?, onUpdate?)`. Use `executionMode: "sequential"` on mutating tools.
- **`configSchema` is required in `openclaw.plugin.json`** (the manifest), not in code. The manifest field is validated at config write time, *before plugin code loads*. Per the docs: "Every plugin must ship a JSON Schema, even if it accepts no config." For a tool plugin with no user config, use:
  ```json
  "configSchema": { "type": "object", "additionalProperties": false, "properties": {} }
  ```
  The `definePluginEntry({ configSchema })` field in code defaults to `emptyPluginConfigSchema` when omitted, so don't pass it — the manifest is the single source of truth. Without the manifest field, install fails with: *"plugin manifest requires configSchema"*.

## Tool skeleton

```ts
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { loadNotebook } from "../nb/load.js";
import { saveNotebook } from "../nb/save.js";
import { resolveCellRef } from "../nb/cell.js";
import { NotebookError } from "../nb/errors.js";
import { toolText } from "../shared/result.js";

const ParamsSchema = Type.Object({ /* see Spec */ });
type Params = Static<typeof ParamsSchema>;

export function registerNotebookEditCell(api: OpenClawPluginApi): void {
  api.registerTool(
    {
      name: "notebook_edit_cell",
      label: "Edit Notebook Cell",
      description: "...", // verbatim from Spec
      parameters: ParamsSchema,
      executionMode: "sequential",
      execute: async (_id, rawParams) => {
        try {
          const params = rawParams as Params;
          // ... domain calls ...
          return toolText(`Edited cell ${cell.id}. ...`);
        } catch (e) {
          if (e instanceof NotebookError) throw e;
          api.logger.error(`notebook_edit_cell unexpected: ${(e as Error).message}`);
          throw new NotebookError(`Internal error: ${(e as Error).message}`);
        }
      },
    },
    { optional: true }, // mutating → opt-in; omit for read-only tools
  );
}
```

## Critical invariants

1. **Atomic save.** `src/nb/save.ts` writes to a sibling temp file → fsync → rename. Never write directly to the user's path. (Sibling, not `/tmp`, so the rename stays POSIX-atomic.)
2. **Cell ids over indexes.** Always populate and return `id`. `loadNotebook` backfills missing ids in memory; persisted only on save.
3. **Editing a code cell clears outputs.** Set `outputs = []` and `execution_count = null`. Mention it in the response text.
4. **Source on disk = string array** (one line per element, trailing `\n`). Tools return joined string form to consumers.
5. **1-space JSON indent on save** — Jupyter convention, minimizes diffs.
6. **nbformat ≥ 4 only.** New cell ids → set `nbformat_minor: 5`.

## Don't

- ❌ Kernel execution (out of scope for v0.1).
- ❌ `@jupyterlab/nbformat` or any other notebook lib.
- ❌ Return `{ isError: true, ... }` — that field doesn't exist on `AgentToolResult`. Throw `NotebookError` instead.
- ❌ Synchronous `fs` calls. `fs/promises` only.
- ❌ Tools outside Spec §3 without updating the spec first.
- ❌ Sidecar/backup files outside `params.path`'s directory.

## Testing

- Mirror `src/` under `tests/`. One file per source module.
- Each tool: 1 happy + 2 error paths.
- Atomic-save guard: target a directory at `dest` to force a real rename failure (don't try to `vi.spyOn` `fs/promises` — fails under NodeNext ESM).
- Run: `pnpm test --run`.

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test --run    # vitest single run
pnpm build         # tsc → dist/

# Install into OpenClaw — ALWAYS via the packed tarball, never the source dir.
pnpm pack:plugin           # build + `npm pack` → *.tgz
openclaw plugins install ./kittipos-openclaw-notebook-tools-0.1.0.tgz
openclaw plugins list      # confirm `notebook-tools` is listed
openclaw gateway restart
```

**Why not `openclaw plugins install <source-dir>`?** It does a recursive
`fs.cp` of the entire repo into `~/.openclaw/extensions/<plugin>/`, including
the pnpm-symlinked `node_modules` (~450 MB). The downstream `npm install`
then fails (silently, because OpenClaw runs it with `--silent`). Installing
from the tarball gives OpenClaw a clean staging dir with only the `files`
whitelist.

## When stuck

- **Plugin not loading?** Check `openclaw plugins list` and gateway logs. Usual cause: missing `.js` extensions on imports, or `package.json` missing `"type": "module"`.
- **Mutating tool not appearing?** It needs a `tools.allow` entry in `~/.openclaw/openclaw.json` (see README).
- **SDK type errors?** You're importing from the deprecated root. Use `openclaw/plugin-sdk/core`.
- **Notebook corruption?** The atomic save is broken. Check `src/nb/save.ts` first.

## Where to look

- `docs/Notebook-Tools-Spec.md` — behavioral source of truth.
- nbformat: <https://nbformat.readthedocs.io/en/latest/format_description.html>
- SDK docs: <https://docs.openclaw.ai/plugins/sdk-overview>
- Authoritative SDK types: `node_modules/openclaw/dist/plugin-sdk/src/plugin-sdk/core.d.ts` and the underlying `pi-agent-core/dist/types.d.ts`.
