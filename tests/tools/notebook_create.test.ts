import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { registerNotebookCreate } from "../../src/tools/notebook_create.js";

import { makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookCreate(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_create", () => {
  it("creates a fresh notebook with cells", async () => {
    const tool = loadTool();
    const dir = await mkdtemp(join(tmpdir(), "nb-create-"));
    const path = join(dir, "new.ipynb");
    const result = await tool.execute("c", {
      path,
      cells: [
        { cell_type: "markdown", source: "# Hello" },
        { cell_type: "code", source: "x = 1" },
      ],
    });
    const payload = result.details as { cell_count: number; cell_ids: string[] };
    expect(payload.cell_count).toBe(2);
    expect(payload.cell_ids).toHaveLength(2);

    const text = await readFile(path, "utf-8");
    const parsed = JSON.parse(text);
    expect(parsed.nbformat).toBe(4);
    expect(parsed.cells).toHaveLength(2);
  });

  it("refuses to overwrite an existing file by default", async () => {
    const tool = loadTool();
    const dir = await mkdtemp(join(tmpdir(), "nb-create-"));
    const path = join(dir, "existing.ipynb");
    await writeFile(path, "{}", "utf-8");
    await expect(tool.execute("c", { path, cells: [] })).rejects.toThrow(
      NotebookError,
    );
  });

  it("rejects non-.ipynb extension", async () => {
    const tool = loadTool();
    await expect(
      tool.execute("c", { path: "/tmp/notes.txt", cells: [] }),
    ).rejects.toThrow(NotebookError);
  });
});
