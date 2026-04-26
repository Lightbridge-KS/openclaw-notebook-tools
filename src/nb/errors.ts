/**
 * Typed domain errors. Tool adapters let `NotebookError` (and subclasses)
 * propagate so the OpenClaw runtime converts them into structured tool error
 * results — matches the SDK contract that says "throw on failure instead of
 * encoding errors in `content`".
 */

export class NotebookError extends Error {
  readonly code: string;

  constructor(message: string, code = "NOTEBOOK_ERROR") {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class NotebookNotFoundError extends NotebookError {
  constructor(path: string) {
    super(`Notebook not found: ${path}`, "NOTEBOOK_NOT_FOUND");
  }
}

export class NotebookAlreadyExistsError extends NotebookError {
  constructor(path: string) {
    super(
      `Notebook already exists: ${path}. Pass overwrite=true to replace.`,
      "NOTEBOOK_ALREADY_EXISTS",
    );
  }
}

export class InvalidNotebookError extends NotebookError {
  constructor(message: string) {
    super(message, "INVALID_NOTEBOOK");
  }
}

export class UnsupportedNbformatError extends NotebookError {
  constructor(version: number | string) {
    super(
      `Unsupported nbformat: v${version}. Only v4 supported.`,
      "UNSUPPORTED_NBFORMAT",
    );
  }
}

export class CellNotFoundError extends NotebookError {
  constructor(ref: { cell_id?: string; index?: number }) {
    const detail =
      ref.cell_id !== undefined
        ? `cell_id=${ref.cell_id}`
        : `index=${ref.index}`;
    super(`Cell not found: ${detail}`, "CELL_NOT_FOUND");
  }
}

export class InvalidParametersError extends NotebookError {
  constructor(message: string) {
    super(message, "INVALID_PARAMETERS");
  }
}

export class StaleNotebookError extends NotebookError {
  constructor(message: string) {
    super(message, "STALE_NOTEBOOK");
  }
}
