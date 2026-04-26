import { describe, expect, it } from "vitest";

import { NotebookError } from "../../src/nb/errors.js";
import { registerNotebookSearch } from "../../src/tools/notebook_search.js";

import { copyFixtureToTemp, makeApi } from "./_harness.js";

function loadTool() {
  const api = makeApi();
  registerNotebookSearch(api as never);
  if (!api.captured) throw new Error("tool not registered");
  return api.captured;
}

describe("notebook_search", () => {
  it("finds matches and returns ids", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    const result = await tool.execute("c", { path, query: "pandas" });
    const payload = result.details as { matches: { id: string }[] };
    expect(payload.matches[0]?.id).toBe("code-cell-1");
  });

  it("rejects empty query", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(tool.execute("c", { path, query: "" })).rejects.toThrow(
      NotebookError,
    );
  });

  it("rejects invalid regex", async () => {
    const tool = loadTool();
    const path = await copyFixtureToTemp("minimal.ipynb");
    await expect(
      tool.execute("c", { path, query: "(", regex: true }),
    ).rejects.toThrow(NotebookError);
  });
});
