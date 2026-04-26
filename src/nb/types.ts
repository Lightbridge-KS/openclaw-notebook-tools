/**
 * Hand-rolled nbformat v4 types.
 *
 * We deliberately do not depend on `@jupyterlab/nbformat` — the surface we need
 * is small and we want full control over the shape that crosses module
 * boundaries.
 *
 * Reference: https://nbformat.readthedocs.io/en/latest/format_description.html
 */

export interface KernelSpec {
  name: string;
  display_name: string;
  language?: string;
}

export interface LanguageInfo {
  name: string;
  version?: string;
  mimetype?: string;
  file_extension?: string;
  pygments_lexer?: string;
  codemirror_mode?: string | Record<string, unknown>;
  nbconvert_exporter?: string;
  [k: string]: unknown;
}

export interface NotebookMetadata {
  kernelspec?: KernelSpec;
  language_info?: LanguageInfo;
  [k: string]: unknown;
}

export interface Notebook {
  nbformat: 4;
  nbformat_minor: number;
  metadata: NotebookMetadata;
  cells: Cell[];
}

export type Cell = CodeCell | MarkdownCell | RawCell;

export interface CodeCell {
  cell_type: "code";
  id: string;
  source: string | string[];
  metadata: Record<string, unknown>;
  execution_count: number | null;
  outputs: CellOutput[];
}

export interface MarkdownCell {
  cell_type: "markdown";
  id: string;
  source: string | string[];
  metadata: Record<string, unknown>;
  attachments?: Record<string, unknown>;
}

export interface RawCell {
  cell_type: "raw";
  id: string;
  source: string | string[];
  metadata: Record<string, unknown>;
  attachments?: Record<string, unknown>;
}

export type CellType = Cell["cell_type"];

export type CellOutput =
  | StreamOutput
  | DisplayDataOutput
  | ExecuteResultOutput
  | ErrorOutput;

export interface StreamOutput {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: string | string[];
}

export interface DisplayDataOutput {
  output_type: "display_data";
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ExecuteResultOutput {
  output_type: "execute_result";
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  execution_count: number | null;
}

export interface ErrorOutput {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}
