import { describe, expect, it } from "vitest";

import {
  newCellId,
  normalizeSourceIn,
  normalizeSourceOut,
  resolveCellRef,
} from "../../src/nb/cell.js";
import {
  CellNotFoundError,
  InvalidParametersError,
} from "../../src/nb/errors.js";
import type { Notebook } from "../../src/nb/types.js";

function nb(): Notebook {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      { cell_type: "markdown", id: "a1", source: "# H", metadata: {} },
      {
        cell_type: "code",
        id: "b2",
        source: "print(1)",
        metadata: {},
        execution_count: null,
        outputs: [],
      },
    ],
  };
}

describe("newCellId", () => {
  it("returns 8-char alphanumeric id", () => {
    const id = newCellId();
    expect(id).toMatch(/^[a-zA-Z0-9]{8}$/);
  });
  it("returns unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newCellId()));
    expect(ids.size).toBe(50);
  });
});

describe("resolveCellRef", () => {
  it("resolves by cell_id", () => {
    const { cell, index } = resolveCellRef(nb(), { cell_id: "b2" });
    expect(index).toBe(1);
    expect(cell.id).toBe("b2");
  });

  it("resolves by index", () => {
    const { cell, index } = resolveCellRef(nb(), { index: 0 });
    expect(index).toBe(0);
    expect(cell.id).toBe("a1");
  });

  it("throws when both provided", () => {
    expect(() => resolveCellRef(nb(), { cell_id: "a1", index: 0 })).toThrow(
      InvalidParametersError,
    );
  });

  it("throws when neither provided", () => {
    expect(() => resolveCellRef(nb(), {})).toThrow(InvalidParametersError);
  });

  it("throws CellNotFoundError for unknown id", () => {
    expect(() => resolveCellRef(nb(), { cell_id: "missing" })).toThrow(
      CellNotFoundError,
    );
  });

  it("throws CellNotFoundError for out-of-bounds index", () => {
    expect(() => resolveCellRef(nb(), { index: 99 })).toThrow(CellNotFoundError);
  });
});

describe("normalizeSource round-trip", () => {
  it.each([
    "",
    "single line",
    "two\nlines",
    "trailing\n",
    "three\nlines\nhere",
  ])("round-trips %j", (input) => {
    const arr = normalizeSourceIn(input);
    expect(normalizeSourceOut(arr)).toBe(input);
  });

  it("normalizeSourceOut accepts string passthrough", () => {
    expect(normalizeSourceOut("plain")).toBe("plain");
  });
});
