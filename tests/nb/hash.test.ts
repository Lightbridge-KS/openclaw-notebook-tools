import { describe, expect, it } from "vitest";

import { StaleNotebookError } from "../../src/nb/errors.js";
import {
  assertFreshFile,
  assertFreshSource,
  sourceSha256,
} from "../../src/nb/hash.js";
import type { CodeCell } from "../../src/nb/types.js";

function code(src: string | string[]): CodeCell {
  return {
    cell_type: "code",
    id: "x",
    source: src,
    metadata: {},
    execution_count: null,
    outputs: [],
  };
}

describe("sourceSha256", () => {
  it("is stable for equivalent sources", () => {
    const a = sourceSha256(code("print(1)\n"));
    const b = sourceSha256(code(["print(1)\n"]));
    expect(a).toBe(b);
  });

  it("differs for different content", () => {
    expect(sourceSha256(code("a"))).not.toBe(sourceSha256(code("b")));
  });
});

describe("assertFreshSource", () => {
  it("noops when expected is undefined", () => {
    expect(() => assertFreshSource(code("a"))).not.toThrow();
  });
  it("throws StaleNotebookError on mismatch", () => {
    expect(() => assertFreshSource(code("a"), "wronghash")).toThrow(
      StaleNotebookError,
    );
  });
  it("passes on match", () => {
    const cell = code("hi");
    expect(() => assertFreshSource(cell, sourceSha256(cell))).not.toThrow();
  });
});

describe("assertFreshFile", () => {
  it("noops when expected is undefined", () => {
    expect(() => assertFreshFile(123)).not.toThrow();
  });
  it("throws on mismatch", () => {
    expect(() => assertFreshFile(100, 200)).toThrow(StaleNotebookError);
  });
});
