import { describe, expect, it } from "vitest";

import { truncateOutputs } from "../../src/nb/outputs.js";
import type { CellOutput } from "../../src/nb/types.js";

const longText = "x".repeat(100);

describe("truncateOutputs", () => {
  it("truncates stream text past maxChars", () => {
    const result = truncateOutputs(
      [{ output_type: "stream", name: "stdout", text: longText }],
      { maxChars: 10, maxItems: 5 },
    );
    const first = result[0];
    expect(first?.output_type).toBe("stream");
    if (first?.output_type === "stream") {
      expect(typeof first.text === "string" && first.text.includes("…[truncated]")).toBe(true);
    }
  });

  it("elides image MIME data", () => {
    const result = truncateOutputs(
      [
        {
          output_type: "display_data",
          data: { "image/png": "base64..." },
          metadata: {},
        },
      ],
      { maxChars: 10, maxItems: 5 },
    );
    const first = result[0];
    if (first?.output_type === "display_data") {
      expect(first.data["image/png"]).toMatch(/^<image:/);
    } else {
      expect.fail("expected display_data");
    }
  });

  it("caps item count and emits an overflow placeholder", () => {
    const outputs: CellOutput[] = Array.from({ length: 7 }, (_, i) => ({
      output_type: "stream",
      name: "stdout",
      text: `line-${i}\n`,
    }));
    const result = truncateOutputs(outputs, { maxChars: 100, maxItems: 3 });
    expect(result).toHaveLength(4);
    const last = result[3];
    if (last?.output_type === "stream") {
      expect(last.text).toMatch(/\+4 more/);
    } else {
      expect.fail("expected overflow placeholder stream");
    }
  });

  it("returns empty when maxItems is 0", () => {
    expect(
      truncateOutputs(
        [{ output_type: "stream", name: "stdout", text: "x" }],
        { maxChars: 10, maxItems: 0 },
      ),
    ).toEqual([]);
  });

  it("elides vendor MIME types", () => {
    const result = truncateOutputs(
      [
        {
          output_type: "execute_result",
          execution_count: 1,
          data: { "application/vnd.foo": { hidden: true } },
          metadata: {},
        },
      ],
      { maxChars: 100, maxItems: 5 },
    );
    const first = result[0];
    if (first?.output_type === "execute_result") {
      expect(first.data["application/vnd.foo"]).toMatch(/elided/);
    } else {
      expect.fail("expected execute_result");
    }
  });
});
