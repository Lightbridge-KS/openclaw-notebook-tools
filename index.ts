// Implemented per Notebook-Tools-Spec.md §8 and CLAUDE.md
// Claude Code: replace this stub with the full registration entry.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "notebook-tools",
  name: "Jupyter Notebook Tools",
  version: "0.1.0",
  description: "Read and edit Jupyter notebooks (.ipynb)",
  register(api) {
    api.logger.info("notebook-tools loaded (stub — implement per spec)");
  },
});
