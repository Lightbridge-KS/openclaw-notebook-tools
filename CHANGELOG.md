# Changelog

All notable changes to OpenClaw Notebook Tools will be documented in this file.

## Unreleased

## 0.1.0-beta.1

- Add nine OpenClaw tools for creating, reading, listing, searching, editing,
  inserting, deleting, clearing outputs, and validating Jupyter notebooks.
- Add atomic notebook writes with sibling temp files, fsync, rename, and
  validation before replacement.
- Add stable cell id handling with in-memory id backfill for older notebooks.
- Add stale-edit guards through `expected_source_sha256` and
  `expected_file_mtime_ms`.
- Add output-aware truncation for notebook reads.
- Add a bundled `notebook-tools` skill so agents use cell-aware notebook tools
  instead of generic file editing on `.ipynb` JSON.
