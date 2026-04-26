import { describe, expect, it } from "vitest";

import { InvalidParametersError } from "../../src/nb/errors.js";
import { searchCells } from "../../src/nb/search.js";
import type { Notebook } from "../../src/nb/types.js";

function nb(): Notebook {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      { cell_type: "markdown", id: "m1", source: "# Title\nintro\n", metadata: {} },
      {
        cell_type: "code",
        id: "c1",
        source: "from sklearn.model_selection import train_test_split\nX, y = ...\n",
        metadata: {},
        execution_count: null,
        outputs: [],
      },
      {
        cell_type: "code",
        id: "c2",
        source: "Train_Test_Split(X)\n",
        metadata: {},
        execution_count: null,
        outputs: [],
      },
    ],
  };
}

describe("searchCells", () => {
  it("finds substring matches case-insensitively by default", () => {
    const matches = searchCells(nb(), { query: "train_test_split" });
    expect(matches).toHaveLength(2);
    expect(matches[0]?.id).toBe("c1");
  });

  it("respects case_sensitive=true", () => {
    const matches = searchCells(nb(), {
      query: "train_test_split",
      case_sensitive: true,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("c1");
  });

  it("filters by cell_type", () => {
    const matches = searchCells(nb(), { query: "Title", cell_type: "markdown" });
    expect(matches).toHaveLength(1);
  });

  it("supports regex mode", () => {
    const matches = searchCells(nb(), { query: "sklearn\\..*import", regex: true });
    expect(matches).toHaveLength(1);
  });

  it("caps results at max_matches", () => {
    const matches = searchCells(nb(), { query: "X", max_matches: 1 });
    expect(matches).toHaveLength(1);
  });

  it("returns context lines around matches", () => {
    const matches = searchCells(nb(), { query: "intro", context_lines: 1 });
    expect(matches[0]?.context).toEqual(["# Title", "intro", ""]);
  });

  it("rejects empty query", () => {
    expect(() => searchCells(nb(), { query: "" })).toThrow(InvalidParametersError);
  });

  it("rejects invalid regex", () => {
    expect(() => searchCells(nb(), { query: "(", regex: true })).toThrow(
      InvalidParametersError,
    );
  });
});
