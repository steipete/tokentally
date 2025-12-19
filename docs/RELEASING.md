# Release Checklist (npm + GitHub)

> Repo uses `pnpm`. Keep `pnpm-lock.yaml` current. CI must be green before tagging.

## 1) Version & metadata

- [ ] Bump version in `package.json` (e.g. `0.1.0`).
- [ ] Confirm `name`, `license`, `repository`, `engines`, and `files` are correct.
- [ ] `pnpm install` (ensures lockfile is current).

## 2) Changelog

- [ ] Update `CHANGELOG.md` with product-facing bullets for that version.
- [ ] Keep entries strictly descending; no duplicates.

## 3) Validation (warning-free)

- [ ] `pnpm check` (must be clean; oxlint is `--deny-warnings`).

## 4) Artifacts

- [ ] `pnpm build`
- [ ] `npm pack --pack-destination /tmp`
- [ ] Checksums (optional, for GitHub release assets):
  - `shasum /tmp/tokentally-<version>.tgz > /tmp/tokentally-<version>.tgz.sha1`
  - `shasum -a 256 /tmp/tokentally-<version>.tgz > /tmp/tokentally-<version>.tgz.sha256`

## 5) Publish to npmjs (tokentally)

- [ ] Confirm npm session / 2FA: `npm whoami`
- [ ] Publish: `npm publish`
- [ ] Verify: `npm view tokentally version`

## 6) Tag + GitHub release

- [ ] Commit + push: `git commit -am "chore(release): vX.Y.Z" && git push`
- [ ] Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] GitHub release (title `X.Y.Z`, body = changelog bullets for that version):
  - `gh release create vX.Y.Z --title X.Y.Z --notes-file /tmp/tokentally-release-notes.md`
  - Attach assets if you built them: `/tmp/tokentally-<version>.tgz*`

## 7) GitHub Packages (npm.pkg.github.com) (optional)

GitHub Packages for npm typically expects a **scoped** package name (e.g. `@steipete/tokentally`). If you want that in addition to `tokentally` on npmjs, publish it as a separate package name/version strategy.
