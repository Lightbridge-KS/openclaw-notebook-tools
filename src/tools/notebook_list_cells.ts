import { stat } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { normalizeSourceOut } from "../nb/cell.js";
import { NotebookError } from "../nb/errors.js";
import { loadNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import type { Cell } from "../nb/types.js";
import { toolJson } from "../shared/result.js";

const ParamsSchema = Type.Object({
  path: Type.String(),
  preview_len: Type.Optional(Type.Integer({ default: 120, minimum: 0 })),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookListCells(api: OpenClawPluginApi): void {
  api.registerTool({
    name: "notebook_list_cells",
    label: "List Notebook Cells",
    description:
      "Lightweight index of a notebook — one object per cell. Use when you only need to find the right cell to act on.",
    parameters: ParamsSchema,
    execute: async (_id, rawParams) => {
      try {
        const params = rawParams as Params;
        const path = normalizeNotebookPath(params.path);
        assertIpynbExtension(path);
        const nb = await loadNotebook(path);
        const stats = await stat(path);
        const previewLen = params.preview_len ?? 120;

        const cells = nb.cells.map((cell, index) => describe(cell, index, previewLen));

        return toolJson({
          path,
          mtime_ms: stats.mtimeMs,
          cell_count: nb.cells.length,
          cells,
        });
      } catch (e) {
        if (e instanceof NotebookError) throw e;
        api.logger.error(`notebook_list_cells unexpected: ${(e as Error).message}`);
        throw new NotebookError(`Internal error: ${(e as Error).message}`);
      }
    },
  });
}

function describe(cell: Cell, index: number, previewLen: number) {
  const source = normalizeSourceOut(cell.source);
  const tags = Array.isArray((cell.metadata as { tags?: unknown }).tags)
    ? ((cell.metadata as { tags: unknown[] }).tags.filter(
        (t): t is string => typeof t === "string",
      ) as string[])
    : [];
  const base = {
    index,
    id: cell.id,
    cell_type: cell.cell_type,
    preview: previewOf(source, previewLen),
    source_chars: source.length,
    line_count: source.length === 0 ? 0 : source.split("\n").length,
    tags,
  };
  if (cell.cell_type === "code") {
    return {
      ...base,
      execution_count: cell.execution_count,
      outputs_count: cell.outputs.length,
      has_outputs: cell.outputs.length > 0,
    };
  }
  return {
    ...base,
    execution_count: null,
    outputs_count: 0,
    has_outputs: false,
  };
}

function previewOf(source: string, max: number): string {
  if (max <= 0) return "";
  const firstLine = source.split("\n", 1)[0] ?? "";
  return firstLine.length <= max ? firstLine : `${firstLine.slice(0, max)}…`;
}
