# Contributing

## Development setup

```bash
pnpm install
pnpm typecheck
pnpm test:run
pnpm plugin:check
pnpm plugin:validate
```

Use Node 22.19 or newer. The package is TypeScript ESM and uses `typebox` for
tool parameter schemas.

## Architecture rules

Keep the layers small and strict:

```text
index.ts        -> composition only
src/tools/*.ts  -> OpenClaw tool adapters and TypeBox schemas
src/nb/*.ts     -> pure notebook domain logic
```

- `src/nb/` must not import from `openclaw/...`.
- Tool files translate OpenClaw parameters into domain calls.
- Mutating tools should use `executionMode: "sequential"`.
- Editing code cells must clear outputs and reset `execution_count`.
- Saving must remain atomic: sibling temp file, fsync, rename.
- Prefer cell ids over indexes in user-facing flows.

## Before opening a PR

Run:

```bash
pnpm typecheck
pnpm test:run
pnpm plugin:check
pnpm plugin:validate
npm pack --dry-run --json
```

Update these files when behavior changes:

- `README.md` for user-facing behavior
- `docs/Notebook-Tools-Spec.md` for tool contracts
- `src/skills/notebook-tools/SKILL.md` for agent operating rules
- `CHANGELOG.md` for release notes

