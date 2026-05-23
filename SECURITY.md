# Security Policy

## Supported versions

Security fixes target the latest released version unless otherwise noted in the
release notes.

## Scope

This plugin reads and edits local Jupyter notebook files. It does not execute
notebook cells, start kernels, run shell commands, or contact external services.

The main safety risks are local-file risks:

- accidental notebook corruption
- silent overwrite of concurrent edits
- stale outputs after source changes
- unexpected writes to the wrong path

The plugin mitigates these with:

- `.ipynb` path validation and `~` expansion
- atomic sibling-temp-file writes
- notebook validation before replacing the original file
- `expected_source_sha256` and `expected_file_mtime_ms` stale guards
- automatic output clearing when editing code cells
- sequential execution mode on mutating tools

## Reporting a vulnerability

Please open a private security advisory on GitHub if the issue can corrupt
notebooks, write outside the requested notebook path, bypass stale-edit checks,
or expose sensitive local data unexpectedly.

For ordinary bugs, use the public issue tracker:
https://github.com/Lightbridge-KS/openclaw-notebook-tools/issues

