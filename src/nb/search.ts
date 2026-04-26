import { normalizeSourceOut } from "./cell.js";
import { InvalidParametersError } from "./errors.js";
import type { CellType, Notebook } from "./types.js";

export interface SearchOptions {
  query: string;
  regex?: boolean;
  case_sensitive?: boolean;
  cell_type?: CellType;
  max_matches?: number;
  context_lines?: number;
}

export interface SearchMatch {
  index: number;
  id: string;
  cell_type: CellType;
  /** 1-based line number within the cell source. */
  line: number;
  preview: string;
  context: string[];
}

const PREVIEW_MAX_CHARS = 200;

export function searchCells(nb: Notebook, opts: SearchOptions): SearchMatch[] {
  if (typeof opts.query !== "string" || opts.query.length === 0) {
    throw new InvalidParametersError("query must be a non-empty string");
  }

  const max = opts.max_matches ?? 20;
  const context = opts.context_lines ?? 1;

  const matcher = buildMatcher(opts);
  const matches: SearchMatch[] = [];

  for (let i = 0; i < nb.cells.length; i++) {
    if (matches.length >= max) break;
    const cell = nb.cells[i];
    if (!cell) continue;
    if (opts.cell_type && cell.cell_type !== opts.cell_type) continue;

    const text = normalizeSourceOut(cell.source);
    const lines = text.split("\n");

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      if (matches.length >= max) break;
      const line = lines[lineIdx] ?? "";
      if (!matcher(line)) continue;

      const start = Math.max(0, lineIdx - context);
      const end = Math.min(lines.length, lineIdx + context + 1);
      matches.push({
        index: i,
        id: cell.id,
        cell_type: cell.cell_type,
        line: lineIdx + 1,
        preview: truncate(line, PREVIEW_MAX_CHARS),
        context: lines.slice(start, end),
      });
    }
  }

  return matches;
}

function buildMatcher(opts: SearchOptions): (line: string) => boolean {
  if (opts.regex) {
    let re: RegExp;
    try {
      re = new RegExp(opts.query, opts.case_sensitive ? "" : "i");
    } catch (err) {
      throw new InvalidParametersError(
        `Invalid regex: ${(err as Error).message}`,
      );
    }
    return (line) => re.test(line);
  }
  if (opts.case_sensitive) {
    return (line) => line.includes(opts.query);
  }
  const needle = opts.query.toLowerCase();
  return (line) => line.toLowerCase().includes(needle);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…[truncated]`;
}
