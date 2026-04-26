import { customAlphabet } from "nanoid/non-secure";

import {
  CellNotFoundError,
  InvalidParametersError,
} from "./errors.js";
import type { Cell, Notebook } from "./types.js";

const CELL_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateId = customAlphabet(CELL_ID_ALPHABET, 8);

/** Fresh nbformat 4.5+ cell id (8 chars, [a-zA-Z0-9]). */
export function newCellId(): string {
  return generateId();
}

export interface CellRef {
  cell_id?: string;
  index?: number;
}

export interface ResolvedCell {
  cell: Cell;
  index: number;
}

/**
 * Resolve a cell reference. Exactly one of `cell_id` or `index` must be set.
 * Cell ids are preferred — they are stable across insert/delete operations.
 */
export function resolveCellRef(nb: Notebook, ref: CellRef): ResolvedCell {
  const hasId = typeof ref.cell_id === "string" && ref.cell_id.length > 0;
  const hasIndex = typeof ref.index === "number" && Number.isInteger(ref.index);

  if (hasId && hasIndex) {
    throw new InvalidParametersError(
      "Provide either cell_id or index, not both.",
    );
  }
  if (!hasId && !hasIndex) {
    throw new InvalidParametersError(
      "Provide one of cell_id or index.",
    );
  }

  if (hasId) {
    const targetId = ref.cell_id as string;
    const idx = nb.cells.findIndex((c) => c.id === targetId);
    if (idx < 0) throw new CellNotFoundError({ cell_id: targetId });
    const cell = nb.cells[idx];
    if (!cell) throw new CellNotFoundError({ cell_id: targetId });
    return { cell, index: idx };
  }

  const idx = ref.index as number;
  if (idx < 0 || idx >= nb.cells.length) {
    throw new CellNotFoundError({ index: idx });
  }
  const cell = nb.cells[idx];
  if (!cell) throw new CellNotFoundError({ index: idx });
  return { cell, index: idx };
}

/**
 * Split a string into the array-of-lines form Jupyter prefers on disk.
 * Trailing `\n` is kept on each line except possibly the final one (matching
 * how nbformat-emitting tools serialize). Empty input yields an empty array.
 */
export function normalizeSourceIn(source: string): string[] {
  if (source.length === 0) return [];
  const parts = source.split("\n");
  const result: string[] = [];
  const last = parts.length - 1;
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i] ?? "";
    if (i < last) {
      result.push(`${segment}\n`);
    } else if (segment.length > 0) {
      result.push(segment);
    }
  }
  return result;
}

/** Join the on-disk array form back into a single string for tool consumers. */
export function normalizeSourceOut(source: string | string[]): string {
  return Array.isArray(source) ? source.join("") : source;
}
