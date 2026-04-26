import { homedir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";

import { InvalidParametersError } from "./errors.js";

/**
 * Expand a leading `~` and resolve to an absolute path. Tools accept paths
 * with `~` for ergonomics but always echo the normalized absolute path back
 * so the agent has a stable identifier in subsequent calls.
 */
export function normalizeNotebookPath(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new InvalidParametersError("path must be a non-empty string");
  }
  let candidate = input;
  if (candidate === "~") {
    candidate = homedir();
  } else if (candidate.startsWith(`~${sep}`) || candidate.startsWith("~/")) {
    candidate = `${homedir()}${candidate.slice(1)}`;
  }
  return isAbsolute(candidate) ? resolve(candidate) : resolve(process.cwd(), candidate);
}

export function assertIpynbExtension(path: string): void {
  if (!path.toLowerCase().endsWith(".ipynb")) {
    throw new InvalidParametersError(
      `Notebook path must end in .ipynb (got: ${path})`,
    );
  }
}
