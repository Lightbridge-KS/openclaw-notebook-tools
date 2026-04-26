import { readFile } from "node:fs/promises";

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { NotebookError, NotebookNotFoundError } from "../nb/errors.js";
import { validateNotebookShape } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { toolJson } from "../shared/result.js";

const ParamsSchema = Type.Object({
  path: Type.String(),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookValidate(api: OpenClawPluginApi): void {
  api.registerTool({
    name: "notebook_validate",
    label: "Validate Notebook",
    description:
      "Validate notebook JSON and nbformat assumptions without changing the file. Use after mutations as a cheap verification gate.",
    parameters: ParamsSchema,
    execute: async (_id, rawParams) => {
      try {
        const params = rawParams as Params;
        const path = normalizeNotebookPath(params.path);
        assertIpynbExtension(path);

        let raw: string;
        try {
          raw = await readFile(path, "utf-8");
        } catch (err) {
          if (isEnoent(err)) throw new NotebookNotFoundError(path);
          throw err;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return toolJson({
            path,
            valid: false,
            errors: ["Invalid notebook: not parseable as JSON"],
            warnings: [],
            cell_count: 0,
            missing_cell_ids_backfillable: 0,
          });
        }

        const result = validateNotebookShape(parsed);
        return toolJson({
          path,
          valid: result.valid,
          nbformat: result.notebook?.nbformat ?? null,
          nbformat_minor: result.notebook?.nbformat_minor ?? null,
          cell_count: result.notebook?.cells.length ?? 0,
          missing_cell_ids_backfillable: result.missing_cell_ids_backfillable,
          warnings: result.warnings,
          errors: result.errors,
        });
      } catch (e) {
        if (e instanceof NotebookError) throw e;
        api.logger.error(`notebook_validate unexpected: ${(e as Error).message}`);
        throw new NotebookError(`Internal error: ${(e as Error).message}`);
      }
    },
  });
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
