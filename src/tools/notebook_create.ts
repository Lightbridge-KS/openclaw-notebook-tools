import { access, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  InvalidParametersError,
  NotebookAlreadyExistsError,
  NotebookError,
} from "../nb/errors.js";
import { createNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { saveNotebook } from "../nb/save.js";
import type { CellType } from "../nb/types.js";
import { toolText } from "../shared/result.js";

const CellTypeSchema = Type.Union([
  Type.Literal("code"),
  Type.Literal("markdown"),
  Type.Literal("raw"),
]);

const ParamsSchema = Type.Object({
  path: Type.String({
    description: "Path to create; may include ~; must end in .ipynb",
  }),
  cells: Type.Optional(
    Type.Array(
      Type.Object({
        cell_type: CellTypeSchema,
        source: Type.Optional(Type.String({ default: "" })),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      { default: [] },
    ),
  ),
  kernel: Type.Optional(
    Type.Object({
      name: Type.Optional(Type.String({ default: "python3" })),
      display_name: Type.Optional(Type.String({ default: "Python 3" })),
      language: Type.Optional(Type.String({ default: "python" })),
    }),
  ),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  overwrite: Type.Optional(Type.Boolean({ default: false })),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookCreate(api: OpenClawPluginApi): void {
  api.registerTool(
    {
      name: "notebook_create",
      label: "Create Notebook",
      description:
        "Create a new Jupyter notebook from structured cells. Use this when the user asks for a new notebook or an analysis scaffold. Do not overwrite an existing notebook unless overwrite=true is explicitly provided.",
      parameters: ParamsSchema,
      executionMode: "sequential",
      execute: async (_id, rawParams) => {
        try {
          const params = rawParams as Params;
          const path = normalizeNotebookPath(params.path);
          assertIpynbExtension(path);

          const exists = await pathExists(path);
          if (exists && !params.overwrite) {
            throw new NotebookAlreadyExistsError(path);
          }

          await ensureParentExists(path);

          const cells = (params.cells ?? []).map((c) => {
            if (!isCellType(c.cell_type)) {
              throw new InvalidParametersError(
                `Invalid cell_type: ${String(c.cell_type)}`,
              );
            }
            return {
              cell_type: c.cell_type,
              source: c.source ?? "",
              ...(c.metadata ? { metadata: c.metadata } : {}),
            };
          });

          const nb = createNotebook({
            cells,
            ...(params.kernel
              ? {
                  kernel: {
                    name: params.kernel.name ?? "python3",
                    display_name: params.kernel.display_name ?? "Python 3",
                    language: params.kernel.language ?? "python",
                  },
                }
              : {}),
            ...(params.metadata ? { metadata: params.metadata } : {}),
          });

          await saveNotebook(path, nb);

          return toolText(
            `Created notebook ${path}. cells=${nb.cells.length}, overwritten=${exists}, kernel=${nb.metadata.kernelspec?.name ?? "n/a"}.`,
            {
              path,
              cell_count: nb.cells.length,
              cell_ids: nb.cells.map((c) => c.id),
              overwritten: exists,
              kernelspec: nb.metadata.kernelspec ?? null,
            },
          );
        } catch (e) {
          if (e instanceof NotebookError) throw e;
          api.logger.error(`notebook_create unexpected: ${(e as Error).message}`);
          throw new NotebookError(`Internal error: ${(e as Error).message}`);
        }
      },
    },
  );
}

function isCellType(value: unknown): value is CellType {
  return value === "code" || value === "markdown" || value === "raw";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentExists(p: string): Promise<void> {
  const parent = dirname(p);
  try {
    const s = await stat(parent);
    if (!s.isDirectory()) {
      throw new InvalidParametersError(`Parent path is not a directory: ${parent}`);
    }
  } catch (err) {
    if (isEnoent(err)) {
      try {
        await mkdir(parent, { recursive: true });
      } catch (e2) {
        throw new InvalidParametersError(
          `Cannot create parent directory ${parent}: ${(e2 as Error).message}`,
        );
      }
      return;
    }
    throw err;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
