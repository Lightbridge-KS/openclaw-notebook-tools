---
name: notebook-tools
description: |
  Use these tools whenever the user asks to read, modify, or clean up
  Jupyter notebooks (.ipynb files).
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
