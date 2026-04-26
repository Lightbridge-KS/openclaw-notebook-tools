import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { normalizeSourceIn } from "./cell.js";
import type { Cell, Notebook } from "./types.js";

/**
 * Atomic write protocol (Spec §4.3):
 *   1. JSON.stringify with 1-space indent (Jupyter convention).
 *   2. Write to a sibling temp file (`.tmp-{pid}-{ts}`) — staying in the same
 *      directory keeps `rename` POSIX-atomic (no EXDEV across filesystems).
 *   3. fsync the temp file handle so the bytes are durable.
 *   4. rename(temp, path) — POSIX-atomic on the same filesystem.
 *   5. On any failure, best-effort `unlink` the temp file and re-throw.
 */
export async function saveNotebook(path: string, nb: Notebook): Promise<void> {
  const serialized = serialize(nb);
  const tempPath = buildTempPath(path);

  let renamed = false;
  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fileHandle = await open(tempPath, "w", 0o644);
    await fileHandle.writeFile(serialized, "utf-8");
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = null;

    await rename(tempPath, path);
    renamed = true;
  } finally {
    if (fileHandle !== null) {
      try {
        await fileHandle.close();
      } catch {
        // already closed or unwritable; nothing more we can do
      }
    }
    if (!renamed) {
      try {
        await unlink(tempPath);
      } catch {
        // temp may not exist; ignore
      }
    }
  }
}

function serialize(nb: Notebook): string {
  const normalized: Notebook = {
    nbformat: 4,
    nbformat_minor: nb.nbformat_minor,
    metadata: nb.metadata,
    cells: nb.cells.map(normalizeCellForDisk),
  };
  return JSON.stringify(normalized, null, 1);
}

function normalizeCellForDisk(cell: Cell): Cell {
  const sourceArray = Array.isArray(cell.source)
    ? cell.source
    : normalizeSourceIn(cell.source);
  if (cell.cell_type === "code") {
    return { ...cell, source: sourceArray };
  }
  return { ...cell, source: sourceArray };
}

function buildTempPath(destination: string): string {
  const dir = dirname(destination);
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return join(dir, `.${baseName(destination)}.tmp-${stamp}`);
}

function baseName(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}
