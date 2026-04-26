import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Fake `OpenClawPluginApi` for unit tests. Captures the tool registration so
 * tests can call `tool.execute(...)` without booting an OpenClaw runtime.
 */
export interface CapturedTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  executionMode?: string;
  execute: (
    toolCallId: string,
    params: unknown,
  ) => Promise<{ content: { type: string; text: string }[]; details: unknown }>;
}

export interface FakeApi {
  registerTool: (tool: CapturedTool, opts?: { optional?: boolean }) => void;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };
  /** Last tool registered. */
  captured?: CapturedTool;
  optional?: boolean;
}

export function makeApi(): FakeApi {
  const api: FakeApi = {
    registerTool: (tool, opts) => {
      api.captured = tool;
      if (opts) api.optional = opts.optional;
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  return api;
}

export async function copyFixtureToTemp(
  fixtureFilename: string,
  destFilename = "nb.ipynb",
): Promise<string> {
  const src = join(__dirname, "..", "fixtures", fixtureFilename);
  const dir = await mkdtemp(join(tmpdir(), "nb-tool-"));
  const dest = join(dir, destFilename);
  await copyFile(src, dest);
  return dest;
}
