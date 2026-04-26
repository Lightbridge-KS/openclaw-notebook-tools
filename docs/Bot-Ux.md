# Bot UX Review: `notebook-tools` vs native OpenClaw + `nbformat`

_Date: 2026-04-26_  
_Reviewer: Bernard, from live OpenClaw tool use_  
_Test notebooks: `~/my_agents/notebook-tests/`

## Executive summary

From the agent side, `notebook-tools` is a clear UX win over native OpenClaw file tooling plus ad-hoc `nbformat` scripting.

The native route is fully capable, but it makes the bot become a notebook library author for every task: load JSON, find cells, manage ids, preserve notebook structure, clear outputs, validate, avoid stale writes, and write atomically. That is possible when the bot has `exec` and Python, but it is verbose, fragile, and easy to get subtly wrong.

`notebook-tools` turns notebook work into intention-level operations: list cells, read targeted cells, search source, edit one cell, insert one cell, delete one cell, clear outputs, validate. The bot can reason at notebook-cell level instead of raw nbformat level.

My practical verdict: **use `notebook-tools` as the default path for agent-facing notebook operations; reserve native `nbformat` scripting for unusual batch migrations or plugin debugging.**

## What I tested

I tested the plugin against notebooks in:

```text
~/my_agents/notebook-tests/
```

Observed notebooks included:

- `notebook_tool_test.ipynb`
- `bernard_native_tooling_playground.ipynb`
- `bernard_optin_tools_smoke.ipynb`

For this UX pass I also created two disposable comparison notebooks in the same test folder:

- `ux_notebook_tools_smoke.ipynb`
- `ux_native_nbformat_smoke.ipynb`

The tested task shape was intentionally ordinary:

1. Create or inspect a notebook.
2. List cells.
3. Read a targeted cell.
4. Search for source text.
5. Edit a code cell.
6. Insert a temporary markdown cell.
7. Delete the inserted cell.
8. Clear or confirm outputs.
9. Validate the final notebook.

## Side-by-side comparison

| Task | `notebook-tools` UX | Native OpenClaw + `nbformat` UX |
|---|---|---|
| Create notebook | One structured `notebook_create` call with cells and kernel metadata. | Write a Python script using `nbformat.v4.new_notebook`, `new_markdown_cell`, `new_code_cell`, then validate and write. |
| List cells | One `notebook_list_cells` call returns id, type, preview, source length, line count, output count, execution count, tags, mtime. | Must load notebook and write a custom summarizer. Easy to omit useful fields unless explicitly coded. |
| Read targeted cell | `notebook_read(cell_ids=[...])` returns joined source, output counts, optional outputs, and `source_sha256`. | Must manually locate the cell, join/interpret source, decide output truncation, and compute any hash yourself. |
| Search source | `notebook_search` returns matching cells with ids, line numbers, previews, and context. | Manual loop over cells and source lines; regex/context behavior must be implemented each time. |
| Edit cell | `notebook_edit_cell` replaces source by stable cell id and clears code outputs automatically. Supports stale guards. | Manual locate-by-id, replace source, remember to set `outputs=[]` and `execution_count=None`, validate, and write. |
| Insert cell | `notebook_insert_cell` inserts relative to an anchor id or position and reports the new cell id. | Manual anchor lookup, create cell, insert into `nb.cells`, ensure/track id, validate, write. |
| Delete cell | `notebook_delete_cell` deletes by id/index and supports a source hash guard. | Manual filter/splice of `nb.cells`; need your own guard if you care about stale edits. |
| Clear outputs | `notebook_clear_outputs` clears all or one code cell and reports affected count. | Manual iteration over code cells, clear outputs, reset execution counts, validate, write. |
| Validate | `notebook_validate` gives notebook facts plus warnings/errors in tool-native form. | `nbformat.validate` works well, but the script must catch/format errors and separately summarize notebook facts. |
| Safety | Atomic saves, validation, id handling, and stale-edit guards are built into the tool flow. | Possible, but only if the bot writes and maintains that safety code in the script. `nbformat.write(path)` by itself is not enough. |
| Token/attention cost | Low: one small tool call per intent; result is already shaped for the agent. | Medium/high: the bot must generate and audit custom code, then parse logs. More opportunities for small mistakes. |
| Failure mode | Usually a structured tool error: bad id, stale guard mismatch, invalid notebook, etc. | Usually a Python exception or, worse, a logically successful script that forgot an invariant. |

## Concrete observations from live testing

### 1. The plugin gives the bot the right unit of thought

With `notebook-tools`, I naturally think in cells:

- "Find the cell with this text."
- "Read that cell by id."
- "Edit that cell if its source hash still matches."
- "Insert after this markdown heading."
- "Validate the notebook before claiming success."

That maps directly to user intent. The native path makes me think in implementation details:

- Is `cell.source` a string or list here?
- Does this notebook have cell ids?
- Did I preserve metadata?
- Did I clear stale outputs after code changes?
- Did I accidentally target by an index that shifted after insertion?
- Did I validate before writing?
- Did I write atomically?

Those are important details, but they are not the task the user asked for.

### 2. The returned metadata is agent-friendly

`notebook_list_cells` is especially useful. It returns just enough information to choose the next action without reading the whole notebook:

- stable cell id
- index
- cell type
- preview
- source character count
- line count
- tags
- execution count
- output count / `has_outputs`
- notebook `mtime_ms`

Native `nbformat` can produce this, but only after writing a custom summarizer. Built-in OpenClaw `read` on a raw `.ipynb` would expose the whole JSON structure, which is too noisy for routine notebook work.

### 3. Stale guards are a major UX improvement

The strongest UX feature is not just that edits are shorter. It is that safe edits are normal.

The plugin returns `source_sha256` from `notebook_read`, and mutating calls can accept `expected_source_sha256` or `expected_file_mtime_ms`. That gives the bot a natural compare-before-write workflow.

In native `nbformat`, stale protection has to be invented every time: stat the file, hash the source, compare, decide what to do, then write. Most agents will skip at least one of those steps under time pressure.

### 4. Output clearing is correctly opinionated

When editing a code cell, the plugin clears outputs and resets `execution_count`. This is the right default. A changed code cell with old outputs is misleading.

Native `nbformat` does not stop you from changing source while leaving old outputs attached. The bot has to remember that invariant manually. This is exactly the kind of quiet notebook footgun a dedicated tool should remove.

### 5. Opt-in mutating tools feel right

In this installed setup, mutating tools were available after explicit opt-in. That is a good trust boundary.

Read-only notebook tools feel safe to expose broadly. Editing tools are more powerful: they alter user files. Having them opt-in makes the plugin safer while preserving the smooth UX once enabled.

From the bot side, the distinction is clear:

- discovery tools: use freely
- mutation tools: use when the user asked for notebook changes, then validate

### 6. The native path is still valuable for plugin debugging

Native `exec` + `nbformat` is not bad; it is just the wrong default UX for ordinary notebook editing.

It remains useful when:

- debugging the plugin itself
- doing unusual multi-notebook migrations
- testing nbformat edge cases
- prototyping future compound operations such as `notebook_apply_ops`

For user-facing notebook work, though, the dedicated tools are calmer and safer.

## Native `nbformat` script burden

To match the plugin behavior, my native test script had to include code for:

- notebook creation
- cell listing summaries
- manual source search
- locating cells by id
- source replacement
- code-output clearing
- insertion after an anchor cell
- deletion by id
- validation
- atomic write via sibling temp file, fsync, and rename

That is a lot of ceremony for a simple edit. It also increases review burden: before running the script, I have to inspect whether the script itself is safe.

This is the central UX difference:

- `notebook-tools`: the bot reviews **parameters**.
- Native `nbformat`: the bot reviews **a program**.

Reviewing parameters is much less error-prone.

## Recommended default workflow for agents

For normal notebook work:

1. `notebook_list_cells` to orient.
2. `notebook_search` if the target is text-described.
3. `notebook_read` for the exact cell before editing.
4. Mutate by `cell_id`, not index:
   - `notebook_edit_cell`
   - `notebook_insert_cell`
   - `notebook_delete_cell`
   - `notebook_clear_outputs`
5. Use stale guards when available:
   - `expected_source_sha256`
   - `expected_file_mtime_ms`
6. `notebook_validate` before reporting success.

Use native `nbformat` only when the task is outside the plugin's current operation set.

## UX improvement suggestions

These are not blockers; the current tool surface is already useful.

1. **Return inserted cell source hash from `notebook_insert_cell`.**  
   The tool reports the new id, which is essential. Returning `source_sha256` too would make immediate guarded follow-up edits/deletes smoother without an extra `notebook_read`.

2. **Consider a compound operation tool later.**  
   Something like `notebook_apply_ops` could batch multiple safe edits with one validation and one atomic save. This would be useful for larger refactors while preserving structured guardrails.

3. **Expose a dry-run/diff mode for mutations.**  
   A preview mode showing cell-level before/after would be excellent for sensitive notebooks.

4. **Keep mutation tools opt-in.**  
   The UX still feels smooth after opt-in, and the trust boundary is worth it.

5. **Document the installed opt-in behavior prominently.**  
   The docs should make it obvious which tools are read-only by default and which require explicit enabling in the local OpenClaw configuration.

## Bottom line

`notebook-tools` changes notebook work from "carefully manipulate a JSON document" into "operate on notebook cells." That is the right abstraction for an AI assistant.

Native OpenClaw tooling plus `nbformat` is powerful, but it pushes too much incidental complexity into every agent turn. The plugin gives better safety, lower token cost, clearer intent, and a more reliable path to validated notebook edits.
