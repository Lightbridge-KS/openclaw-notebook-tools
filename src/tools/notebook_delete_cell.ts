import { stat } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { resolveCellRef } from "../nb/cell.js";
import { NotebookError } from "../nb/errors.js";
import {
  assertFreshFile,
  assertFreshSource,
} from "../nb/hash.js";
import { loadNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { saveNotebook } from "../nb/save.js";
import { toolText } from "../shared/result.js";

const ParamsSchema = Type.Object({
  path: Type.String(),
  cell_id: Type.Optional(Type.String()),
  index: Type.Optional(Type.Integer({ minimum: 0 })),
  expected_source_sha256: Type.Optional(Type.String()),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookDeleteCell(api: OpenClawPluginApi): void {
  api.registerTool(
    {
      name: "notebook_delete_cell",
      label: "Delete Notebook Cell",
      description: "Delete a cell by id or index.",
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

          nb.cells.splice(index, 1);
          await saveNotebook(path, nb);

          return toolText(
            `Deleted cell ${cell.id} (was index ${index}). Notebook now has ${nb.cells.length} cells.`,
            {
              path,
              deleted_cell_id: cell.id,
              previous_index: index,
              cell_count: nb.cells.length,
            },
          );
        } catch (e) {
          if (e instanceof NotebookError) throw e;
          api.logger.error(
            `notebook_delete_cell unexpected: ${(e as Error).message}`,
          );
          throw new NotebookError(`Internal error: ${(e as Error).message}`);
        }
      },
    },
  );
}
