import { stat } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { normalizeSourceOut, resolveCellRef } from "../nb/cell.js";
import {
  InvalidParametersError,
  NotebookError,
} from "../nb/errors.js";
import {
  assertFreshFile,
  assertFreshSource,
  sourceSha256,
} from "../nb/hash.js";
import { buildNewCell, loadNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { saveNotebook } from "../nb/save.js";
import type { Cell, CellType } from "../nb/types.js";
import { toolText } from "../shared/result.js";

const CellTypeSchema = Type.Union([
  Type.Literal("code"),
  Type.Literal("markdown"),
  Type.Literal("raw"),
]);

const ParamsSchema = Type.Object({
  path: Type.String(),
  cell_id: Type.Optional(Type.String()),
  index: Type.Optional(Type.Integer({ minimum: 0 })),
  new_source: Type.String(),
  new_cell_type: Type.Optional(CellTypeSchema),
  expected_source_sha256: Type.Optional(Type.String()),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookEditCell(api: OpenClawPluginApi): void {
  api.registerTool(
    {
      name: "notebook_edit_cell",
      label: "Edit Notebook Cell",
      description:
        "Replace the source of a single cell. Optionally change cell type. Editing a code cell automatically clears its outputs and execution_count.",
      parameters: ParamsSchema,
      executionMode: "sequential",
      execute: async (_id, rawParams) => {
        try {
          const params = rawParams as Params;
          const path = normalizeNotebookPath(params.path);
          assertIpynbExtension(path);

          const stats = await stat(path);
          assertFreshFile(stats.mtimeMs, params.expected_file_mtime_ms);

          const nb = await loadNotebook(path);
          const ref: { cell_id?: string; index?: number } = {};
          if (params.cell_id !== undefined) ref.cell_id = params.cell_id;
          if (params.index !== undefined) ref.index = params.index;
          const { cell, index } = resolveCellRef(nb, ref);

          assertFreshSource(cell, params.expected_source_sha256);

          const oldChars = normalizeSourceOut(cell.source).length;
          const cellType: CellType = params.new_cell_type ?? cell.cell_type;
          const replaced: Cell = buildNewCell(
            cellType,
            params.new_source,
            cell.metadata,
          );
          // Preserve the existing id — `buildNewCell` would have assigned a fresh one.
          replaced.id = cell.id;

          nb.cells[index] = replaced;
          await saveNotebook(path, nb);

          const newChars = params.new_source.length;
          const clearedNote =
            cellType === "code" ? " Outputs cleared." : "";
          const typeNote =
            params.new_cell_type && params.new_cell_type !== cell.cell_type
              ? ` cell_type ${cell.cell_type} → ${params.new_cell_type}.`
              : ` cell_type=${cellType}.`;

          return toolText(
            `Edited cell ${cell.id} (was index ${index}).${typeNote} Source: ${oldChars} → ${newChars} chars.${clearedNote} New source_sha256=${sourceSha256(replaced)}.`,
            {
              path,
              cell_id: cell.id,
              index,
              cell_type: cellType,
              source_chars: newChars,
              source_sha256: sourceSha256(replaced),
              outputs_cleared: cellType === "code",
            },
          );
        } catch (e) {
          if (e instanceof NotebookError) throw e;
          if (e instanceof InvalidParametersError) throw e;
          api.logger.error(
            `notebook_edit_cell unexpected: ${(e as Error).message}`,
          );
          throw new NotebookError(`Internal error: ${(e as Error).message}`);
        }
      },
    },
  );
}
