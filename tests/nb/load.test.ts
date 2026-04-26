import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  InvalidNotebookError,
  NotebookNotFoundError,
  UnsupportedNbformatError,
} from "../../src/nb/errors.js";
import {
  createNotebook,
  loadNotebook,
  validateNotebookShape,
} from "../../src/nb/load.js";

const fixtures = join(__dirname, "..", "fixtures");

describe("loadNotebook", () => {
  it("loads minimal fixture", async () => {
    const nb = await loadNotebook(join(fixtures, "minimal.ipynb"));
    expect(nb.nbformat).toBe(4);
    expect(nb.cells).toHaveLength(2);
    expect(nb.cells[0]?.id).toBe("md-cell-1");
  });

  it("backfills missing cell ids", async () => {
    const nb = await loadNotebook(join(fixtures, "missing_ids.ipynb"));
    for (const cell of nb.cells) {
      expect(cell.id).toMatch(/^[a-zA-Z0-9]{8}$/);
    }
  });

  it("throws NotebookNotFoundError when missing", async () => {
    await expect(loadNotebook("/nonexistent/path/no.ipynb")).rejects.toThrow(
      NotebookNotFoundError,
    );
  });

  it("throws InvalidNotebookError on malformed JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nb-test-"));
    const path = join(dir, "broken.ipynb");
    await writeFile(path, "{ not json", "utf-8");
    await expect(loadNotebook(path)).rejects.toThrow(InvalidNotebookError);
  });

  it("throws UnsupportedNbformatError on nbformat v3", async () => {
    await expect(loadNotebook(join(fixtures, "nbformat_v3.ipynb"))).rejects.toThrow(
      UnsupportedNbformatError,
    );
  });
});

describe("createNotebook", () => {
  it("creates an empty notebook with defaults", () => {
    const nb = createNotebook();
    expect(nb.nbformat).toBe(4);
    expect(nb.nbformat_minor).toBe(5);
    expect(nb.metadata.kernelspec?.name).toBe("python3");
    expect(nb.cells).toEqual([]);
  });

  it("assigns ids to provided cells", () => {
    const nb = createNotebook({
      cells: [
        { cell_type: "code", source: "x = 1" },
        { cell_type: "markdown", source: "## hello" },
      ],
    });
    expect(nb.cells).toHaveLength(2);
    for (const cell of nb.cells) {
      expect(cell.id).toMatch(/^[a-zA-Z0-9]{8}$/);
    }
  });

  it("code cells start with empty outputs and null execution_count", () => {
    const nb = createNotebook({ cells: [{ cell_type: "code", source: "" }] });
    const code = nb.cells[0];
    expect(code?.cell_type).toBe("code");
    if (code?.cell_type === "code") {
      expect(code.outputs).toEqual([]);
      expect(code.execution_count).toBeNull();
    }
  });
});

describe("validateNotebookShape", () => {
  it("returns valid=false for non-object root", () => {
    expect(validateNotebookShape("string").valid).toBe(false);
  });

  it("flags backfillable missing cell ids", () => {
    const result = validateNotebookShape({
      nbformat: 4,
      nbformat_minor: 4,
      metadata: {},
      cells: [{ cell_type: "code", source: "x", metadata: {}, execution_count: null, outputs: [] }],
    });
    expect(result.valid).toBe(true);
    expect(result.missing_cell_ids_backfillable).toBe(1);
  });
});
