import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { registerNotebookValidate } from "../../src/tools/notebook_validate.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookValidate(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_validate", () => {
  it("reports valid=true for a well-formed notebook", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("c", { path });
    const payload = result.details as { valid: boolean; cell_count: number };
    expect(payload.valid).toBe(true);
    expect(payload.cell_count).toBe(2);
  });

  it("returns valid=false (not throw) for malformed JSON", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await writeFile(path, "{ broken", "utf-8");
    const result = await tool.execute("c", { path });
    const payload = result.details as { valid: boolean; errors: string[] };
    expect(payload.valid).toBe(false);
    expect(payload.errors[0]).toMatch(/JSON/);
  });

  it("throws NotebookError when file is missing", async () => {
    const tool = loadTool();
    await expect(
      tool.execute("c", { path: "/no/such/notebook.ipynb" }),
    ).rejects.toThrow(NotebookError);
  });
});
