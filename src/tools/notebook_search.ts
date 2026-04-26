import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import { NotebookError } from "../nb/errors.js";
import { loadNotebook } from "../nb/load.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../nb/path.js";
import { searchCells } from "../nb/search.js";
import { toolJson } from "../shared/result.js";

const ParamsSchema = Type.Object({
  path: Type.String(),
  query: Type.String(),
  regex: Type.Optional(Type.Boolean({ default: false })),
  case_sensitive: Type.Optional(Type.Boolean({ default: false })),
  cell_type: Type.Optional(
    Type.Union([
      Type.Literal("code"),
      Type.Literal("markdown"),
      Type.Literal("raw"),
    ]),
  ),
  max_matches: Type.Optional(Type.Integer({ default: 20, minimum: 1 })),
  context_lines: Type.Optional(
    Type.Integer({ default: 1, minimum: 0, maximum: 5 }),
  ),
});

type Params = Static<typeof ParamsSchema>;

export function registerNotebookSearch(api: OpenClawPluginApi): void {
  api.registerTool({
    name: "notebook_search",
    label: "Search Notebook",
    description:
      "Search cell sources and return matching cells with stable ids. Use this before editing when the target cell is known by text, heading, variable name, or code fragment.",
    parameters: ParamsSchema,
    execute: async (_id, rawParams) => {
      try {
        const params = rawParams as Params;
        const path = normalizeNotebookPath(params.path);
        assertIpynbExtension(path);
        const nb = await loadNotebook(path);
        const matches = searchCells(nb, {
          query: params.query,
          regex: params.regex ?? false,
          case_sensitive: params.case_sensitive ?? false,
          ...(params.cell_type ? { cell_type: params.cell_type } : {}),
          max_matches: params.max_matches ?? 20,
          context_lines: params.context_lines ?? 1,
        });
        return toolJson({ path, query: params.query, matches });
      } catch (e) {
        if (e instanceof NotebookError) throw e;
        api.logger.error(`notebook_search unexpected: ${(e as Error).message}`);
        throw new NotebookError(`Internal error: ${(e as Error).message}`);
      }
    },
  });
}
