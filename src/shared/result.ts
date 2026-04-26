/**
 * Tiny adapter helpers shaped to match the SDK's `AgentToolResult<T>` type:
 *   { content: (TextContent | ImageContent)[]; details: T; terminate?: boolean }
 *
 * The SDK contract says: throw on failure instead of encoding errors in
 * `content`. So we deliberately do not export a `toolError` helper — domain
 * code throws typed `NotebookError`s and the SDK converts them.
 */

export interface ToolTextContent {
  type: "text";
  text: string;
}

export interface ToolResult<TDetails> {
  content: ToolTextContent[];
  details: TDetails;
}

export function toolText<TDetails extends Record<string, unknown>>(
  text: string,
  details: TDetails = {} as TDetails,
): ToolResult<TDetails> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function toolJson<TDetails>(payload: TDetails): ToolResult<TDetails> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}
