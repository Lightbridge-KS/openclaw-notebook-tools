import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { loadNotebook } from "../../src/nb/load.js";
import { registerNotebookInsertCell } from "../../src/tools/notebook_insert_cell.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookInsertCell(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_insert_cell", () => {
  it("inserts after an anchor by id", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("c", {
      path,
      cell_type: "markdown",
      source: "## Inserted",
      anchor_id: "md-cell-1",
      placement: "after",
    });
    const payload = result.details as { index: number; cell_count: number };
    expect(payload.index).toBe(1);
    expect(payload.cell_count).toBe(3);

    const nb = await loadNotebook(path);
    expect(nb.cells[1]?.cell_type).toBe("markdown");
  });

  it("rejects when more than one of position/anchor_id/anchor_index provided", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", {
        path,
        cell_type: "code",
        source: "x",
        position: 0,
        anchor_id: "md-cell-1",
      }),
    ).rejects.toThrow(NotebookError);
  });

  it("rejects out-of-bounds position", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", {
        path,
        cell_type: "code",
        source: "x",
        position: 999,
      }),
    ).rejects.toThrow(NotebookError);
  });
});
