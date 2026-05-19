import type {
  AnyAgentTool,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";

import { registerNotebookClearOutputs } from "./notebook_clear_outputs.js";
import { registerNotebookCreate } from "./notebook_create.js";
import { registerNotebookDeleteCell } from "./notebook_delete_cell.js";
import { registerNotebookEditCell } from "./notebook_edit_cell.js";
import { registerNotebookInsertCell } from "./notebook_insert_cell.js";
import { registerNotebookListCells } from "./notebook_list_cells.js";
import { registerNotebookRead } from "./notebook_read.js";
import { registerNotebookSearch } from "./notebook_search.js";
import { registerNotebookValidate } from "./notebook_validate.js";

type RegisterToolOptions = { optional?: boolean };
type RegisterNotebookTool = (api: OpenClawPluginApi) => void;

export interface NotebookToolPluginDefinition {
  tool: AnyAgentTool;
  optional: boolean;
  register: RegisterNotebookTool;
}

const registerNotebookTools: readonly RegisterNotebookTool[] = [
  registerNotebookCreate,
  registerNotebookRead,
  registerNotebookListCells,
  registerNotebookSearch,
  registerNotebookEditCell,
  registerNotebookInsertCell,
  registerNotebookDeleteCell,
  registerNotebookClearOutputs,
  registerNotebookValidate,
];

export const notebookToolPluginDefinitions: readonly NotebookToolPluginDefinition[] =
  registerNotebookTools.map((register) => {
    const { tool, optional } = captureNotebookTool(register);
    return { tool, optional, register };
  });

export function createNotebookTool(
  definition: NotebookToolPluginDefinition,
  api: OpenClawPluginApi,
): AnyAgentTool {
  return captureNotebookTool(definition.register, api).tool;
}

function captureNotebookTool(
  register: RegisterNotebookTool,
  apiForRuntime?: OpenClawPluginApi,
): Pick<NotebookToolPluginDefinition, "tool" | "optional"> {
  let captured: { tool: AnyAgentTool; optional: boolean } | undefined;

  const api = {
    ...(apiForRuntime ?? {}),
    registerTool: (tool: unknown, options?: RegisterToolOptions) => {
      if (typeof tool === "function") {
        throw new Error("notebook-tools does not support nested tool factories");
      }
      captured = {
        tool: tool as AnyAgentTool,
        optional: options?.optional === true,
      };
    },
    logger: apiForRuntime?.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  } as OpenClawPluginApi;

  register(api);

  if (!captured) {
    throw new Error("notebook tool registration did not register a tool");
  }
  return captured;
}
