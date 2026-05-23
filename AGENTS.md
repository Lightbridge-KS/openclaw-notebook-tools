# OpenClaw Notebook Tools

`@lightbridge-ks/openclaw-notebook-tools` — OpenClaw plugin, 9 tools for reading/editing Jupyter notebooks. Behavioral spec: `docs/Notebook-Tools-Spec.md`. This file is the **how to implement it** doc.

## Stack

Node ≥ 22.19, TypeScript strict ESM, `typebox`, `nanoid`, Vitest. `openclaw` is a dev dependency for build/validation and a peer dependency at runtime. No `@jupyterlab/nbformat` — types are hand-rolled in `src/nb/types.ts`.

## Architecture (non-negotiable)

```
index.ts        →  composition only (register tools)
src/tools/*.ts  →  adapters (TypeBox schemas, throw on failure)
src/nb/*.ts     →  pure domain (no SDK imports, throws typed errors)
```

1. **`src/nb/` MUST NOT import from `openclaw/...`.** If you want an SDK type in `src/nb/`, the abstraction is wrong.
2. **`src/tools/` is the only layer that knows the SDK.** Each `execute()` body wraps domain calls in `try/catch` and **re-throws typed `NotebookError`s**. The SDK converts thrown errors into structured tool error results.
3. **`index.ts` is composition only.**

## SDK contract (verified against `openclaw@2026.5.20`)

- Runtime entry imports **`defineToolPlugin` from `openclaw/plugin-sdk/tool-plugin`**. Use `definePluginEntry` only if the plugin needs mixed/dynamic runtime surfaces.
- Tool adapters may still import `OpenClawPluginApi` and `AnyAgentTool` from **`openclaw/plugin-sdk/core`** when wrapping the existing `api.registerTool(...)` functions.
- Import TypeBox schemas from **`typebox`**, not `@sinclair/typebox`. Current OpenClaw tool-plugin metadata generation expects `typebox`.
- `AgentTool { label: string }` — `label` is **required**. Don't omit it.
- `AgentToolResult = { content, details, terminate? }` — there is **no `isError` field**. Throw on failure; the SDK wraps the thrown error.
- `execute(toolCallId, params, signal?, onUpdate?)`. Use `executionMode: "sequential"` on mutating tools.
- `defineToolPlugin` supplies an empty strict `configSchema` when none is provided, and `openclaw plugins build` writes it into `openclaw.plugin.json`. For a tool plugin with no user config, the generated manifest schema should be:
  ```json
  "configSchema": { "type": "object", "additionalProperties": false, "properties": {} }
  ```
- Run `pnpm plugin:build` after changing plugin id, name, description, activation, config schema, or tool names so `openclaw.plugin.json`, `contracts.tools`, and `package.json` stay aligned.

## Tool skeleton

```ts
import { Type, type Static } from "typebox";
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
- Run: `pnpm test:run`.

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test:run    # vitest single run
pnpm build         # tsc → dist/
pnpm plugin:build  # build + regenerate openclaw.plugin.json/package metadata
pnpm plugin:check  # CI-style stale metadata check
pnpm plugin:validate

# Install into OpenClaw — ALWAYS via the packed tarball, never the source dir.
pnpm pack:plugin           # plugin:build + `npm pack` → *.tgz
openclaw plugins install ./lightbridge-ks-openclaw-notebook-tools-0.1.0-beta.2.tgz
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
- **Tool missing from discovery?** Run `pnpm plugin:build` and check that `openclaw.plugin.json` has every tool in `contracts.tools`.
- **SDK type errors?** Keep the runtime entry on `openclaw/plugin-sdk/tool-plugin`; keep tool adapter API types on `openclaw/plugin-sdk/core`.
- **Notebook corruption?** The atomic save is broken. Check `src/nb/save.ts` first.

## Where to look

- `docs/Notebook-Tools-Spec.md` — behavioral source of truth.
- nbformat: <https://nbformat.readthedocs.io/en/latest/format_description.html>
- SDK docs: <https://docs.openclaw.ai/plugins/sdk-overview>
- Authoritative SDK types: `node_modules/openclaw/dist/plugin-sdk/src/plugin-sdk/core.d.ts` and the underlying `pi-agent-core/dist/types.d.ts`.
