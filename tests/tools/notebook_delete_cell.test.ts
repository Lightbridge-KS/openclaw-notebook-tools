import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { loadNotebook } from "../../src/nb/load.js";
import { registerNotebookDeleteCell } from "../../src/tools/notebook_delete_cell.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookDeleteCell(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_delete_cell", () => {
  it("deletes by id", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("c", { path, cell_id: "md-cell-1" });
    const payload = result.details as { cell_count: number };
    expect(payload.cell_count).toBe(1);
    const nb = await loadNotebook(path);
    expect(nb.cells.find((c) => c.id === "md-cell-1")).toBeUndefined();
  });

  it("fails when cell id is unknown", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", { path, cell_id: "no-such-cell" }),
    ).rejects.toThrow(NotebookError);
  });

  it("fails on stale expected_file_mtime_ms", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", {
        path,
        cell_id: "md-cell-1",
        expected_file_mtime_ms: 1, // ancient mtime — guaranteed mismatch
      }),
    ).rejects.toThrow(NotebookError);
  });
});
