import { createHash } from "node:crypto";

import { normalizeSourceOut } from "./cell.js";
import { StaleNotebookError } from "./errors.js";
import type { Cell } from "./types.js";

/** SHA-256 of a cell's source (joined string form), hex-encoded. */
export function sourceSha256(cell: Cell): string {
  const text = normalizeSourceOut(cell.source);
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

export function assertFreshSource(cell: Cell, expected?: string): void {
  if (typeof expected !== "string") return;
  const actual = sourceSha256(cell);
  if (actual !== expected) {
    throw new StaleNotebookError(
      `Cell source has changed since the last read (expected sha256=${expected}, got ${actual}).`,
    );
  }
}

export function assertFreshFile(actualMtimeMs: number, expected?: number): void {
  if (typeof expected !== "number") return;
  if (Math.abs(actualMtimeMs - expected) > 0.5) {
    throw new StaleNotebookError(
      `Notebook file changed on disk since the last read (expected mtime_ms=${expected}, got ${actualMtimeMs}).`,
    );
  }
}
