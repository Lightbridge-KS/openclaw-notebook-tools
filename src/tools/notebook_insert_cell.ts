import { stat } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  InvalidParametersError,
  NotebookError,
} from "../nb/errors.js";
import { assertFreshFile } from "../nb/hash.js";
import { buildNewCell, loadNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { saveNotebook } from "../nb/save.js";
import type { Cell, Notebook } from "../nb/types.js";
import { toolText } from "../shared/result.js";

const CellTypeSchema = Type.Union([
  Type.Literal("code"),
  Type.Literal("markdown"),
  Type.Literal("raw"),
]);

const ParamsSchema = Type.Object({
  path: Type.String(),
  cell_type: CellTypeSchema,
  source: Type.Optional(Type.String({ default: "" })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  position: Type.Optional(Type.Integer({ minimum: 0 })),
  anchor_id: Type.Optional(Type.String()),
  anchor_index: Type.Optional(Type.Integer({ minimum: 0 })),
  placement: Type.Optional(
    Type.Union([Type.Literal("before"), Type.Literal("after")], {
      default: "after",
    }),
  ),
  expected_file_mtime_ms: Type.Optional(Type.Number()),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookInsertCell(api: OpenClawPluginApi): void {
  api.registerTool(
    {
      name: "notebook_insert_cell",
      label: "Insert Notebook Cell",
      description:
        "Insert a new cell. Position is specified relative to an anchor cell (before/after an anchor_id or anchor_index), or at an absolute position. New cells get a freshly generated id.",
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
          const insertIndex = computeInsertIndex(nb, params);

          const cell: Cell = buildNewCell(
            params.cell_type,
            params.source ?? "",
            params.metadata ?? {},
          );

          nb.cells.splice(insertIndex, 0, cell);
          await saveNotebook(path, nb);

          return toolText(
            `Inserted ${params.cell_type} cell ${cell.id} at index ${insertIndex}. Notebook now has ${nb.cells.length} cells.`,
            {
              path,
              cell_id: cell.id,
              index: insertIndex,
              cell_count: nb.cells.length,
            },
          );
        } catch (e) {
          if (e instanceof NotebookError) throw e;
          if (e instanceof InvalidParametersError) throw e;
          api.logger.error(
            `notebook_insert_cell unexpected: ${(e as Error).message}`,
          );
          throw new NotebookError(`Internal error: ${(e as Error).message}`);
        }
      },
    },
  );
}

function computeInsertIndex(nb: Notebook, params: Params): number {
  const positionSet = typeof params.position === "number";
  const anchorIdSet = typeof params.anchor_id === "string" && params.anchor_id.length > 0;
  const anchorIndexSet = typeof params.anchor_index === "number";
  const provided = [positionSet, anchorIdSet, anchorIndexSet].filter(Boolean).length;
  if (provided !== 1) {
    throw new InvalidParametersError(
      "Provide exactly one of: position, anchor_id, or anchor_index.",
    );
  }

  if (positionSet) {
    const pos = params.position as number;
    if (pos > nb.cells.length) {
      throw new InvalidParametersError(
        `position ${pos} out of bounds (notebook has ${nb.cells.length} cells)`,
      );
    }
    return pos;
  }

  const placement = params.placement ?? "after";

  if (anchorIdSet) {
    const idx = nb.cells.findIndex((c) => c.id === params.anchor_id);
    if (idx < 0) {
      throw new InvalidParametersError(
        `Anchor cell not found: anchor_id=${params.anchor_id}`,
      );
    }
    return placement === "before" ? idx : idx + 1;
  }

  const anchorIdx = params.anchor_index as number;
  if (anchorIdx < 0 || anchorIdx >= nb.cells.length) {
    throw new InvalidParametersError(
      `anchor_index ${anchorIdx} out of bounds (notebook has ${nb.cells.length} cells)`,
    );
  }
  return placement === "before" ? anchorIdx : anchorIdx + 1;
}
