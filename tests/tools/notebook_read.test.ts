import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { registerNotebookRead } from "../../src/tools/notebook_read.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookRead(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_read", () => {
  it("returns cells with ids and source_sha256 (happy path)", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("call-1", { path });
    const payload = result.details as { cells: Array<{ id: string; source_sha256: string }> };
    expect(payload.cells).toHaveLength(2);
    expect(payload.cells[0]?.id).toBe("md-cell-1");
    expect(payload.cells[0]?.source_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects when both cell_range and cell_ids provided", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("call-2", {
        path,
        cell_range: { start: 0, end: 1 },
        cell_ids: ["md-cell-1"],
      }),
    ).rejects.toThrow(NotebookError);
  });

  it("throws NotebookError when path is missing", async () => {
    const tool = loadTool();
    await expect(
      tool.execute("call-3", { path: "/no/such/file.ipynb" }),
    ).rejects.toThrow(NotebookError);
  });
});
