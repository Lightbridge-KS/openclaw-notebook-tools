import { describe, expect, it } from "vitest";

import { loadNotebook } from "../../src/nb/load.js";
import { registerNotebookEditCell } from "../../src/tools/notebook_edit_cell.js";
import { NotebookError } from "../../src/nb/errors.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookEditCell(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_edit_cell", () => {
  it("replaces source and clears outputs for a code cell", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("with_outputs.ipynb");
    const before = await loadNotebook(path);
    const code = before.cells[0];
    expect(code?.cell_type).toBe("code");
    if (code?.cell_type !== "code") return;
    expect(code.outputs.length).toBeGreaterThan(0);

    const result = await tool.execute("c", {
      path,
      cell_id: code.id,
      new_source: "print('replaced')\n",
    });
    const payload = result.details as { outputs_cleared: boolean; cell_id: string };
    expect(payload.cell_id).toBe(code.id);
    expect(payload.outputs_cleared).toBe(true);

    const after = await loadNotebook(path);
    const sameCell = after.cells.find((c) => c.id === code.id);
    expect(sameCell?.cell_type).toBe("code");
    if (sameCell?.cell_type === "code") {
      expect(sameCell.outputs).toEqual([]);
      expect(sameCell.execution_count).toBeNull();
    }
  });

  it("fails when expected_source_sha256 is stale", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", {
        path,
        cell_id: "md-cell-1",
        new_source: "x",
        expected_source_sha256: "wronghash",
      }),
    ).rejects.toThrow(NotebookError);
  });

  it("fails when neither cell_id nor index is provided", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", { path, new_source: "x" }),
    ).rejects.toThrow(NotebookError);
  });
});
