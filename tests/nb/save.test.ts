import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadNotebook } from "../../src/nb/load.js";
import { saveNotebook } from "../../src/nb/save.js";

const fixtures = join(__dirname, "..", "fixtures");

describe("saveNotebook", () => {
  it("round-trips a fixture through load → save → load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nb-save-"));
    const dest = join(dir, "round.ipynb");
    const nb = await loadNotebook(join(fixtures, "minimal.ipynb"));
    await saveNotebook(dest, nb);
    const loaded = await loadNotebook(dest);
    expect(loaded.cells).toHaveLength(nb.cells.length);
    expect(loaded.cells[0]?.id).toBe(nb.cells[0]?.id);
  });

  it("uses 1-space indent on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nb-save-"));
    const dest = join(dir, "indent.ipynb");
    const nb = await loadNotebook(join(fixtures, "minimal.ipynb"));
    await saveNotebook(dest, nb);
    const text = await readFile(dest, "utf-8");
    const lines = text.split("\n");
    // First line is `{`, second line indented with exactly one space.
    expect(lines[1]?.startsWith(" ") && !lines[1]?.startsWith("  ")).toBe(true);
  });

  it("does not corrupt the original file when rename fails", async () => {
    // Force a real rename failure: destination is a directory, so
    // rename(tempFile, directory) fails with EISDIR/ENOTEMPTY.
    const dir = await mkdtemp(join(tmpdir(), "nb-save-"));
    const dest = join(dir, "guarded.ipynb");
    await mkdir(dest); // dest exists as a directory, not a file

    const nb = await loadNotebook(join(fixtures, "minimal.ipynb"));
    await expect(saveNotebook(dest, nb)).rejects.toThrow();

    // dest is still a directory; no temp file should remain alongside it.
    const remaining = await readdir(dir);
    expect(remaining.filter((n) => n.includes(".tmp-"))).toHaveLength(0);
    expect(remaining).toContain("guarded.ipynb");
  });
});
