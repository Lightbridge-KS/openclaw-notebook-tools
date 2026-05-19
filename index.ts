import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

import {
  createNotebookTool,
  notebookToolPluginDefinitions,
} from "./src/tools/definitions.js";

export default defineToolPlugin({
  id: "notebook-tools",
  name: "Jupyter Notebook Tools",
  description: "Read and edit Jupyter notebooks (.ipynb)",
  tools: (tool) =>
    notebookToolPluginDefinitions.map((definition) =>
      tool({
        name: definition.tool.name,
        label: definition.tool.label,
        description: definition.tool.description,
        parameters: definition.tool.parameters as never,
        optional: definition.optional,
        factory: ({ api }) => createNotebookTool(definition, api),
      }),
    ),
});
