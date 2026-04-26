import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { registerNotebookListCells } from "../../src/tools/notebook_list_cells.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookListCells(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_list_cells", () => {
  it("returns a per-cell index", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("c", { path });
    const payload = result.details as { cell_count: number; cells: { id: string; preview: string }[] };
    expect(payload.cell_count).toBe(2);
    expect(payload.cells[0]?.preview).toBe("# Sample notebook");
  });

  it("rejects non-.ipynb path", async () => {
    const tool = loadTool();
    await expect(tool.execute("c", { path: "/tmp/foo.txt" })).rejects.toThrow(
      NotebookError,
    );
  });

  it("rejects unsupported nbformat", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("nbformat_v3.ipynb");
    await expect(tool.execute("c", { path })).rejects.toThrow(NotebookError);
  });
});
