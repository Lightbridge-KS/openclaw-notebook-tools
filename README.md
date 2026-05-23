# OpenClaw Notebook Tools

> **Cell-aware Jupyter notebook editing for OpenClaw agents, without raw JSON surgery.**

OpenClaw plugin: read and edit Jupyter notebooks (`.ipynb`) with structured,
cell-aware tools instead of raw nbformat JSON.

After install, the agent gets all 9 tools — no extra configuration needed.
Mutating tools are guarded by atomic writes and stale-edit checks rather than
by a per-tool opt-in.

| Tool                      | Side effect | Purpose                                      |
| ------------------------- | ----------- | -------------------------------------------- |
| `notebook_read`           | No          | Full or targeted structured read             |
| `notebook_list_cells`     | No          | Cheap index — id, type, preview, counts      |
| `notebook_search`         | No          | Find cells by source text / regex            |
| `notebook_validate`       | No          | Validate notebook structure and report facts |
| `notebook_create`         | Yes         | Create a new notebook from structured cells  |
| `notebook_edit_cell`      | Yes         | Replace a cell's source / type               |
| `notebook_insert_cell`    | Yes         | Insert a new cell at position                |
| `notebook_delete_cell`    | Yes         | Delete a cell by id or index                 |
| `notebook_clear_outputs`  | Yes         | Clear outputs (all or single cell)           |


## Why?

OpenClaw's built-in `read` / `write` / `edit` tools treat `.ipynb` files as
opaque JSON. The agent has to manipulate raw nbformat — error-prone,
token-hungry, and easy to corrupt. This plugin provides a cell-aware API with:

- **Atomic writes** (temp file + fsync + rename) so a crash mid-edit can never
  corrupt the user's notebook.
- **Stable cell ids** (nbformat 4.5+, backfilled in memory for older
  notebooks) so multi-step edits don't drift after inserts/deletes.
- **Stale-edit guards** (`expected_source_sha256`, `expected_file_mtime_ms`)
  so concurrent edits in JupyterLab/VS Code can't be silently overwritten.
- **Output-aware truncation** so reading a notebook full of large outputs
  doesn't blow your token budget.

## Safety model

This plugin intentionally exposes all nine tools as always-on once installed.
That keeps notebook work ergonomic for agents: they can inspect, edit, clean,
and validate notebooks without a second allowlist step.

The trust boundary is implemented in the tool behavior instead:

- Mutating tools use sequential execution so concurrent tool calls do not race.
- Writes are atomic: save to a sibling temp file, fsync, then rename.
- Mutations validate notebook structure before replacing the original file.
- Stale guards (`expected_source_sha256`, `expected_file_mtime_ms`) prevent
  silent overwrites when a notebook changed after the agent inspected it.
- Editing a code cell clears its outputs and execution count, avoiding stale
  result displays.
- The plugin never executes notebook code. It only reads and edits files.
- Agents should run `notebook_validate` after mutations before reporting
  success.

## Install

Install from ClawHub:

```bash
openclaw plugins install clawhub:@kittipos/openclaw-notebook-tools
openclaw plugins list
openclaw gateway restart
```

For local development, install from a packed tarball (not from the source directory — see "Why pack
first?" below):

```bash
pnpm install
pnpm pack:plugin                   # builds, refreshes plugin metadata, then runs `npm pack`
                                   # → kittipos-openclaw-notebook-tools-0.1.0-beta.1.tgz

openclaw plugins install ./kittipos-openclaw-notebook-tools-0.1.0-beta.1.tgz
openclaw plugins list              # confirm `notebook-tools` is listed
openclaw gateway restart
```

### Why pack first?

`openclaw plugins install <dir>` recursively copies the source directory into
`~/.openclaw/extensions/<plugin>/` and then runs `npm install` there. With a
pnpm-managed dev tree, that copies hundreds of MB of symlinked
`node_modules` and breaks the install.

`npm pack` respects the `files` whitelist in `package.json`, producing a small
tarball with runtime JS, the plugin manifest, public docs, and the shipped
skill. OpenClaw extracts the tarball into a clean staging directory and runs
`npm install` against just our runtime deps (`typebox`, `nanoid`).

## Develop

```bash
pnpm install
pnpm test         # vitest watch mode
pnpm test:run   # single run (CI mode)
pnpm typecheck    # tsc --noEmit
pnpm build        # tsc → dist/
pnpm plugin:build # build + regenerate OpenClaw plugin metadata
pnpm plugin:check # build + fail if generated metadata is stale
pnpm plugin:validate
npm pack --dry-run --json
clawhub package publish "$(pwd)" --owner kittipos --version 0.1.0-beta.1 --dry-run --json
```

The codebase follows Clean Architecture:

- `src/nb/` — pure notebook domain (no SDK imports), unit-testable in isolation.
- `src/tools/` — adapter layer: TypeBox schemas, error mapping, tool registration.
- `index.ts` — composition only, wires tools into `defineToolPlugin`.
