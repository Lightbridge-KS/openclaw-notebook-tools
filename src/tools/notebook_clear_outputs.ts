import { stat } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { resolveCellRef } from "../nb/cell.js";
import {
  InvalidParametersError,
  NotebookError,
} from "../nb/errors.js";
import { assertFreshFile } from "../nb/hash.js";
import { loadNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { saveNotebook } from "../nb/save.js";
import { toolText } from "../shared/result.js";

const ParamsSchema = Type.Object({
  path: Type.String(),
  cell_id: Type.Optional(Type.String()),
  index: Type.Optional(Type.Integer({ minimum: 0 })),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookClearOutputs(api: OpenClawPluginApi): void {
  api.registerTool(
    {
      name: "notebook_clear_outputs",
      label: "Clear Notebook Outputs",
      description:
        "Clear cell outputs. Either all code cells, or a specific one. If neither cell_id nor index is provided, clears all code-cell outputs.",
      parameters: ParamsSchema,
      executionMode: "sequential",
      execute: async (_id, rawParams) => {
        try {
          const params = rawParams as Params;
          const path = normalizeNotebookPath(params.path);
          assertIpynbExtension(path);

          if (params.cell_id !== undefined && params.index !== undefined) {
            throw new InvalidParametersError(
              "Provide either cell_id or index, not both.",
            );
          }

          const stats = await stat(path);
          assertFreshFile(stats.mtimeMs, params.expected_file_mtime_ms);

          const nb = await loadNotebook(path);

          let cellsAffected = 0;
          let outputsCleared = 0;
          let detailIds: string[] = [];

          if (params.cell_id !== undefined || params.index !== undefined) {
            const ref: { cell_id?: string; index?: number } = {};
            if (params.cell_id !== undefined) ref.cell_id = params.cell_id;
            if (params.index !== undefined) ref.index = params.index;
            const { cell } = resolveCellRef(nb, ref);
            if (cell.cell_type !== "code") {
              return toolText(
                `Cell ${cell.id} is ${cell.cell_type}; nothing to clear.`,
                { path, cells_affected: 0, outputs_cleared: 0 },
              );
            }
            outputsCleared += cell.outputs.length;
            cell.outputs = [];
            cell.execution_count = null;
            cellsAffected = 1;
            detailIds = [cell.id];
          } else {
            for (const cell of nb.cells) {
              if (cell.cell_type === "code" && (cell.outputs.length > 0 || cell.execution_count !== null)) {
                outputsCleared += cell.outputs.length;
                cell.outputs = [];
                cell.execution_count = null;
                cellsAffected++;
                detailIds.push(cell.id);
              }
            }
          }

          await saveNotebook(path, nb);

          return toolText(
            `Cleared ${outputsCleared} output${outputsCleared === 1 ? "" : "s"} across ${cellsAffected} code cell${cellsAffected === 1 ? "" : "s"}.`,
            {
              path,
              cells_affected: cellsAffected,
              outputs_cleared: outputsCleared,
              cell_ids: detailIds,
            },
          );
        } catch (e) {
          if (e instanceof NotebookError) throw e;
          api.logger.error(
            `notebook_clear_outputs unexpected: ${(e as Error).message}`,
          );
          throw new NotebookError(`Internal error: ${(e as Error).message}`);
        }
      },
    },
  );
}
