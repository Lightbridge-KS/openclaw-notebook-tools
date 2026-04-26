import { stat } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { normalizeSourceOut } from "../nb/cell.js";
import {
  CellNotFoundError,
  InvalidParametersError,
  NotebookError,
} from "../nb/errors.js";
import { sourceSha256 } from "../nb/hash.js";
import { loadNotebook } from "../nb/load.js";
import { truncateOutputs } from "../nb/outputs.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import type { Cell, CellOutput } from "../nb/types.js";
import { toolJson } from "../shared/result.js";

const ParamsSchema = Type.Object({
  path: Type.String({ description: "Path to .ipynb; may include ~" }),
  include_outputs: Type.Optional(Type.Boolean({ default: false })),
  max_output_chars: Type.Optional(Type.Integer({ default: 2000, minimum: 0 })),
  max_output_items: Type.Optional(Type.Integer({ default: 5, minimum: 0 })),
  cell_range: Type.Optional(
    Type.Object({
      start: Type.Integer({ minimum: 0 }),
      end: Type.Integer({ minimum: 0 }),
    }),
  ),
  cell_ids: Type.Optional(Type.Array(Type.String())),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookRead(api: OpenClawPluginApi): void {
  api.registerTool({
    name: "notebook_read",
    label: "Read Notebook",
    description:
      "Read a Jupyter notebook and return its cells as structured data. Use this before editing when cell contents are needed.",
    parameters: ParamsSchema,
    execute: async (_id, rawParams) => {
      try {
        const params = rawParams as Params;
        const path = normalizeNotebookPath(params.path);
        assertIpynbExtension(path);

        if (params.cell_range && params.cell_ids) {
          throw new InvalidParametersError(
            "Provide either cell_range or cell_ids, not both.",
          );
        }

        const nb = await loadNotebook(path);
        const stats = await stat(path);

        const includeOutputs = params.include_outputs ?? false;
        const maxChars = params.max_output_chars ?? 2000;
        const maxItems = params.max_output_items ?? 5;

        const targetCells = selectCells(nb.cells, params);

        const cellsOut = targetCells.map(({ cell, index }) =>
          renderCell(cell, index, includeOutputs, maxChars, maxItems),
        );

        return toolJson({
          path,
          mtime_ms: stats.mtimeMs,
          nbformat: nb.nbformat,
          nbformat_minor: nb.nbformat_minor,
          metadata: nb.metadata,
          cells: cellsOut,
        });
      } catch (e) {
        if (e instanceof NotebookError) throw e;
        api.logger.error(`notebook_read unexpected: ${(e as Error).message}`);
        throw new NotebookError(`Internal error: ${(e as Error).message}`);
      }
    },
  });
}

interface CellWithIndex {
  cell: Cell;
  index: number;
}

function selectCells(cells: Cell[], params: Params): CellWithIndex[] {
  if (params.cell_range) {
    const { start, end } = params.cell_range;
    if (start > cells.length || end > cells.length || start > end) {
      throw new InvalidParametersError(
        `cell_range out of bounds (notebook has ${cells.length} cells)`,
      );
    }
    return cells.slice(start, end).map((cell, i) => ({ cell, index: start + i }));
  }
  if (params.cell_ids && params.cell_ids.length > 0) {
    const out: CellWithIndex[] = [];
    for (const id of params.cell_ids) {
      const idx = cells.findIndex((c) => c.id === id);
      if (idx < 0) throw new CellNotFoundError({ cell_id: id });
      const cell = cells[idx];
      if (!cell) throw new CellNotFoundError({ cell_id: id });
      out.push({ cell, index: idx });
    }
    return out;
  }
  return cells.map((cell, index) => ({ cell, index }));
}

interface RenderedCell {
  index: number;
  id: string;
  cell_type: Cell["cell_type"];
  source: string;
  source_sha256: string;
  line_count: number;
  execution_count?: number | null;
  outputs_count?: number;
  outputs?: CellOutput[];
}

function renderCell(
  cell: Cell,
  index: number,
  includeOutputs: boolean,
  maxChars: number,
  maxItems: number,
): RenderedCell {
  const source = normalizeSourceOut(cell.source);
  const out: RenderedCell = {
    index,
    id: cell.id,
    cell_type: cell.cell_type,
    source,
    source_sha256: sourceSha256(cell),
    line_count: source.length === 0 ? 0 : source.split("\n").length,
  };
  if (cell.cell_type === "code") {
    out.execution_count = cell.execution_count;
    out.outputs_count = cell.outputs.length;
    if (includeOutputs) {
      out.outputs = truncateOutputs(cell.outputs, { maxChars, maxItems });
    }
  }
  return out;
}
