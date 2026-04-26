import { readFile } from "node:fs/promises";

import { newCellId } from "./cell.js";
import {
  InvalidNotebookError,
  NotebookNotFoundError,
  UnsupportedNbformatError,
} from "./errors.js";
import type {
  Cell,
  CellOutput,
  CellType,
  CodeCell,
  KernelSpec,
  MarkdownCell,
  Notebook,
  NotebookMetadata,
  RawCell,
} from "./types.js";

const SUPPORTED_CELL_TYPES: ReadonlySet<CellType> = new Set([
  "code",
  "markdown",
  "raw",
]);

export interface CreateNotebookCellInput {
  cell_type: CellType;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateNotebookOptions {
  cells?: CreateNotebookCellInput[];
  kernel?: Partial<KernelSpec>;
  metadata?: NotebookMetadata;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: ValidationWarning[];
  /** Number of cells we backfilled an `id` for during the in-memory load. */
  missing_cell_ids_backfillable: number;
  notebook?: Notebook;
}

/** Read + parse + validate. Backfills missing cell ids in memory. */
export async function loadNotebook(path: string): Promise<Notebook> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if (isEnoent(err)) throw new NotebookNotFoundError(path);
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidNotebookError("Invalid notebook: not parseable as JSON");
  }

  return assertValidNotebook(parsed);
}

/** Synchronous shape check used by `notebook_validate` and `loadNotebook`. */
export function validateNotebookShape(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: ValidationWarning[] = [];

  if (!isPlainObject(value)) {
    errors.push("Notebook root must be a JSON object");
    return { valid: false, errors, warnings, missing_cell_ids_backfillable: 0 };
  }

  const nbformat = value["nbformat"];
  if (typeof nbformat !== "number") {
    errors.push("Missing or non-numeric `nbformat` field");
  } else if (nbformat !== 4) {
    return {
      valid: false,
      errors: [`Unsupported nbformat: v${nbformat}. Only v4 supported.`],
      warnings,
      missing_cell_ids_backfillable: 0,
    };
  }

  const nbformatMinor = value["nbformat_minor"];
  if (typeof nbformatMinor !== "number") {
    errors.push("Missing or non-numeric `nbformat_minor` field");
  } else if (nbformatMinor < 5) {
    warnings.push({
      code: "OLD_NBFORMAT_MINOR",
      message: `nbformat_minor=${nbformatMinor} predates cell ids (v4.5). Cell ids are backfilled in memory but only persisted on save.`,
    });
  }

  const cellsRaw = value["cells"];
  if (!Array.isArray(cellsRaw)) {
    errors.push("`cells` must be an array");
    return { valid: false, errors, warnings, missing_cell_ids_backfillable: 0 };
  }

  const cells: Cell[] = [];
  let backfilled = 0;
  for (let i = 0; i < cellsRaw.length; i++) {
    const cellResult = normalizeCell(cellsRaw[i], i);
    if (cellResult.kind === "error") {
      errors.push(cellResult.message);
      continue;
    }
    if (cellResult.backfilled) backfilled++;
    cells.push(cellResult.cell);
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, missing_cell_ids_backfillable: backfilled };
  }

  const metadata = isPlainObject(value["metadata"])
    ? (value["metadata"] as NotebookMetadata)
    : {};

  const notebook: Notebook = {
    nbformat: 4,
    nbformat_minor: typeof nbformatMinor === "number" ? nbformatMinor : 5,
    metadata,
    cells,
  };

  return {
    valid: true,
    errors,
    warnings,
    missing_cell_ids_backfillable: backfilled,
    notebook,
  };
}

/** Build a fresh nbformat v4.5 notebook for `notebook_create`. */
export function createNotebook(options: CreateNotebookOptions = {}): Notebook {
  const kernelspec: KernelSpec = {
    name: options.kernel?.name ?? "python3",
    display_name: options.kernel?.display_name ?? "Python 3",
    language: options.kernel?.language ?? "python",
  };

  const baseMetadata: NotebookMetadata = {
    kernelspec,
    language_info: { name: kernelspec.language ?? "python" },
    ...(options.metadata ?? {}),
  };
  if (options.metadata?.kernelspec) {
    baseMetadata.kernelspec = options.metadata.kernelspec as KernelSpec;
  }

  const cells: Cell[] = (options.cells ?? []).map((c) =>
    buildNewCell(c.cell_type, c.source ?? "", c.metadata ?? {}),
  );

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: baseMetadata,
    cells,
  };
}

export function buildNewCell(
  cellType: CellType,
  source: string,
  metadata: Record<string, unknown> = {},
): Cell {
  if (cellType === "code") {
    const code: CodeCell = {
      cell_type: "code",
      id: newCellId(),
      source,
      metadata,
      execution_count: null,
      outputs: [],
    };
    return code;
  }
  if (cellType === "markdown") {
    const md: MarkdownCell = {
      cell_type: "markdown",
      id: newCellId(),
      source,
      metadata,
    };
    return md;
  }
  const raw: RawCell = {
    cell_type: "raw",
    id: newCellId(),
    source,
    metadata,
  };
  return raw;
}

function assertValidNotebook(value: unknown): Notebook {
  if (!isPlainObject(value)) {
    throw new InvalidNotebookError("Notebook root must be a JSON object");
  }
  const nbformat = value["nbformat"];
  if (typeof nbformat !== "number") {
    throw new InvalidNotebookError("Missing or non-numeric `nbformat` field");
  }
  if (nbformat !== 4) {
    throw new UnsupportedNbformatError(nbformat);
  }
  const result = validateNotebookShape(value);
  if (!result.valid || !result.notebook) {
    throw new InvalidNotebookError(
      result.errors[0] ?? "Notebook failed validation",
    );
  }
  return result.notebook;
}

interface NormalizedCellResult {
  kind: "ok";
  cell: Cell;
  backfilled: boolean;
}

interface CellNormalizationError {
  kind: "error";
  message: string;
}

function normalizeCell(
  raw: unknown,
  index: number,
): NormalizedCellResult | CellNormalizationError {
  if (!isPlainObject(raw)) {
    return { kind: "error", message: `Cell at index ${index} is not an object` };
  }
  const cellType = raw["cell_type"];
  if (typeof cellType !== "string" || !SUPPORTED_CELL_TYPES.has(cellType as CellType)) {
    return {
      kind: "error",
      message: `Cell at index ${index} has unsupported cell_type: ${String(cellType)}`,
    };
  }

  const sourceRaw = raw["source"];
  let source: string | string[];
  if (typeof sourceRaw === "string") {
    source = sourceRaw;
  } else if (Array.isArray(sourceRaw) && sourceRaw.every((s) => typeof s === "string")) {
    source = sourceRaw as string[];
  } else if (sourceRaw === undefined) {
    source = "";
  } else {
    return {
      kind: "error",
      message: `Cell at index ${index} has invalid source (must be string or string[])`,
    };
  }

  const metadata = isPlainObject(raw["metadata"])
    ? (raw["metadata"] as Record<string, unknown>)
    : {};

  const idRaw = raw["id"];
  const hasId = typeof idRaw === "string" && idRaw.length > 0;
  const id = hasId ? (idRaw as string) : newCellId();

  if (cellType === "code") {
    const executionCount = raw["execution_count"];
    const execution_count: number | null =
      typeof executionCount === "number" ? executionCount : null;
    const outputsRaw = raw["outputs"];
    const outputs: CellOutput[] = Array.isArray(outputsRaw)
      ? (outputsRaw.filter(isPlainObject) as unknown as CellOutput[])
      : [];
    const cell: CodeCell = {
      cell_type: "code",
      id,
      source,
      metadata,
      execution_count,
      outputs,
    };
    return { kind: "ok", cell, backfilled: !hasId };
  }

  if (cellType === "markdown") {
    const cell: MarkdownCell = {
      cell_type: "markdown",
      id,
      source,
      metadata,
    };
    if (isPlainObject(raw["attachments"])) {
      cell.attachments = raw["attachments"] as Record<string, unknown>;
    }
    return { kind: "ok", cell, backfilled: !hasId };
  }

  const rawCell: RawCell = {
    cell_type: "raw",
    id,
    source,
    metadata,
  };
  if (isPlainObject(raw["attachments"])) {
    rawCell.attachments = raw["attachments"] as Record<string, unknown>;
  }
  return { kind: "ok", cell: rawCell, backfilled: !hasId };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
