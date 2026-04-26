import { definePluginEntry } from "openclaw/plugin-sdk/core";

import { registerNotebookClearOutputs } from "./src/tools/notebook_clear_outputs.js";
import { registerNotebookCreate } from "./src/tools/notebook_create.js";
import { registerNotebookDeleteCell } from "./src/tools/notebook_delete_cell.js";
import { registerNotebookEditCell } from "./src/tools/notebook_edit_cell.js";
import { registerNotebookInsertCell } from "./src/tools/notebook_insert_cell.js";
import { registerNotebookListCells } from "./src/tools/notebook_list_cells.js";
import { registerNotebookRead } from "./src/tools/notebook_read.js";
import { registerNotebookSearch } from "./src/tools/notebook_search.js";
import { registerNotebookValidate } from "./src/tools/notebook_validate.js";

export default definePluginEntry({
  id: "notebook-tools",
  name: "Jupyter Notebook Tools",
  description: "Read and edit Jupyter notebooks (.ipynb)",
  register(api) {
    registerNotebookCreate(api);
    registerNotebookRead(api);
    registerNotebookListCells(api);
    registerNotebookSearch(api);
    registerNotebookEditCell(api);
    registerNotebookInsertCell(api);
    registerNotebookDeleteCell(api);
    registerNotebookClearOutputs(api);
    registerNotebookValidate(api);
    api.logger.info("notebook-tools v0.1.0 — 9 tools registered");
  },
});
