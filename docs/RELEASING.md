# Release Checklist (npm + GitHub)

> This repo uses `pnpm`. Keep `pnpm-lock.yaml` current and ensure CI is green before tagging.

## 1) Prep

- [ ] Ensure working tree clean: `git status`
- [ ] Pull latest main: `git pull --rebase`
- [ ] Install deps: `pnpm install`

## 2) Version + changelog

- [ ] Bump version in `package.json` (e.g. `0.1.0`).
- [ ] Update `CHANGELOG.md` with product-facing bullets for that version.

## 3) Validate (must be warning-free)

- [ ] `pnpm check`

## 4) Build artifacts + sanity

- [ ] Build: `pnpm build`
- [ ] Dry-run publish contents: `npm pack --pack-destination /tmp`
- [ ] Quick smoke from empty dir:
  - `mkdir -p /tmp/tokentally-smoke && cd /tmp/tokentally-smoke`
  - `npm init -y`
  - `npm install /tmp/tokentally-<version>.tgz`
  - `node -e "import('tokentally').then(m=>console.log(Object.keys(m)))"`

## 5) Publish to npm (tokentally)

- [ ] Confirm npm session / 2FA: `npm whoami`
- [ ] Publish: `npm publish`
- [ ] Verify registry: `npm view tokentally version`

## 6) Tag + GitHub release

- [ ] Commit + push: `git commit -am "chore(release): vX.Y.Z" && git push`
- [ ] Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] Create GitHub release (title `X.Y.Z`, body = changelog bullets for that version):
  - `gh release create vX.Y.Z --title X.Y.Z --notes-file /tmp/tokentally-release-notes.md`
  - Attach tarball if desired: `/tmp/tokentally-<version>.tgz`

## 7) GitHub Packages (optional)

GitHub Packages for npm typically expects a scoped package name (e.g. `@steipete/tokentally`) and publishing to `https://npm.pkg.github.com`.

- [ ] Decide whether to publish a scoped variant; keep `tokentally` on npmjs.
