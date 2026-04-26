import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { loadNotebook } from "../../src/nb/load.js";
import { registerNotebookClearOutputs } from "../../src/tools/notebook_clear_outputs.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookClearOutputs(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_clear_outputs", () => {
  it("clears all code-cell outputs when no target provided", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("with_outputs.ipynb");
    const result = await tool.execute("c", { path });
    const payload = result.details as { cells_affected: number; outputs_cleared: number };
    expect(payload.cells_affected).toBeGreaterThan(0);
    expect(payload.outputs_cleared).toBeGreaterThan(0);

    const nb = await loadNotebook(path);
    for (const cell of nb.cells) {
      if (cell.cell_type === "code") {
        expect(cell.outputs).toEqual([]);
        expect(cell.execution_count).toBeNull();
      }
    }
  });

  it("fails when both cell_id and index provided", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("with_outputs.ipynb");
    await expect(
      tool.execute("c", { path, cell_id: "out-cell-1", index: 0 }),
    ).rejects.toThrow(NotebookError);
  });

  it("does nothing for a markdown cell target (no error)", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("c", { path, cell_id: "md-cell-1" });
    const payload = result.details as { cells_affected: number };
    expect(payload.cells_affected).toBe(0);
  });
});
