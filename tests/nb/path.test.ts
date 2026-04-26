import { homedir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { InvalidParametersError } from "../../src/nb/errors.js";
import { assertIpynbExtension, normalizeNotebookPath } from "../../src/nb/path.js";

describe("normalizeNotebookPath", () => {
  it("expands `~` to home", () => {
    expect(normalizeNotebookPath("~")).toBe(homedir());
  });
  it("expands `~/foo`", () => {
    expect(normalizeNotebookPath("~/foo.ipynb")).toBe(resolve(homedir(), "foo.ipynb"));
  });
  it("resolves a relative path", () => {
    expect(normalizeNotebookPath("a.ipynb")).toBe(resolve(process.cwd(), "a.ipynb"));
  });
  it("returns absolute paths unchanged", () => {
    expect(normalizeNotebookPath("/abs/x.ipynb")).toBe("/abs/x.ipynb");
  });
  it("rejects empty input", () => {
    expect(() => normalizeNotebookPath("")).toThrow(InvalidParametersError);
  });
});

describe("assertIpynbExtension", () => {
  it("accepts .ipynb", () => {
    expect(() => assertIpynbExtension("/x/y.ipynb")).not.toThrow();
  });
  it("accepts .IPYNB (case-insensitive)", () => {
    expect(() => assertIpynbExtension("/x/y.IPYNB")).not.toThrow();
  });
  it("rejects other extensions", () => {
    expect(() => assertIpynbExtension("/x/y.json")).toThrow(InvalidParametersError);
  });
});
