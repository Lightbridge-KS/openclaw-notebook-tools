# Release Process

This project publishes an OpenClaw tool plugin package for npm, GitHub
Releases, and ClawHub.

## Prerequisites

- GitHub Actions repository secrets:
  - `NPM_TOKEN` for npm publish.
  - `CLAWHUB_TOKEN` for ClawHub publish.
- GitHub environment:
  - `npm-release` for the protected publish job.
- A clean `main` branch.

## Local preflight

```bash
pnpm install
pnpm typecheck
pnpm test:run
pnpm plugin:check
pnpm plugin:validate
npm pack --dry-run --json
clawhub package publish "$(pwd)" --owner Lightbridge-KS --version 0.1.0-beta.2 --dry-run --json
```

## Release checklist

1. Update `package.json` version.
2. Add a matching `CHANGELOG.md` section.
3. Run local preflight.
4. Commit the release prep.
5. Tag the commit:

   ```bash
   git tag v0.1.0-beta.2
   git push origin main v0.1.0-beta.2
   ```

6. In GitHub Actions, run **Release** with:
   - `tag`: `v0.1.0-beta.2`
   - `preflight_only`: `true`
   - `npm_dist_tag`: `latest` for stable, `beta` for prerelease

7. After preflight succeeds, run **Release** again from `main` with:
   - `preflight_only`: `false`
   - `preflight_run_id`: the successful preflight run id
   - `publish_clawhub`: `true` when ready

The publish job reuses the exact tarball produced by preflight. It publishes to
npm, creates or updates a draft GitHub Release, uploads the tarball and checksum,
and optionally publishes to ClawHub.

## ClawHub notes

Use dry-run first:

```bash
clawhub package publish "$(pwd)" --owner Lightbridge-KS --version 0.1.0-beta.2 --dry-run --json
```

Expected install shape after publication:

```bash
openclaw plugins install clawhub:@lightbridge-ks/openclaw-notebook-tools
openclaw gateway restart
```
