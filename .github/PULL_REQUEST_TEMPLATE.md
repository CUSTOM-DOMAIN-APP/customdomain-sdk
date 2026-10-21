<!--
  This template exists because of API-12. A fix to the SDK source was marked
  FIXED and reached ZERO integrators: the version was bumped in package.json but
  never tagged, release.yml fires on `push: tags: ["v*"]` and on nothing else, so
  it never ran (no red check anywhere), and npm served the pre-fix 0.3.0 source
  for six days. Two further defects were found the same way and had never been
  filed (@customdomain/react@0.3.0 shipped with no purchase rail at all).

  The lesson was not "remember to tag". It was that the checklist ENDED AT THE
  PUSH, so nothing in the process ever looked at the artefact users install.
  The release section below therefore ends at the live registry.
-->

## What changed and why

<!-- One paragraph. If this fixes a reported defect, name it. -->

## Does this change a PUBLISHED package?

- [ ] No: docs, CI or tooling only. Delete the release section below.
- [ ] Yes: `customdomain-js` and/or `@customdomain/react`. Complete every box.

> **Editing the source of a package is not shipping it.** This repo is the only
> source of both packages and is what `npm i customdomain-js` installs. The
> product monorepo holds no SDK source: its `packages/sdk` and `packages/react`
> are the published tarballs, and its hosted bundle
> (`apps/app/public/widget-assets/customdomain-sdk.js`) is a *second*
> distribution channel copied from them. Both follow a release only when
> `scripts/vendor-sdk.sh X.Y.Z` runs there.

---

## Release checklist

### Before merge

- [ ] **Parity asserts updated in the same commit:** `packages/react/src/sdk-parity.assert.ts`
      for a new rail, `packages/sdk/src/whitelabel-parity.assert.ts` for a new
      white-label key, `packages/sdk/src/open-mode-parity.assert.ts` for a new
      widget `mode`. They are compile-time and only run where they are included.
- [ ] **Both manifests bumped:** `packages/sdk/package.json` **and**
      `packages/react/package.json`. `@customdomain/react` depends on
      `customdomain-js: workspace:*`; `pnpm publish` rewrites that to the concrete
      version, so a half-bump ships a mismatched pair.
- [ ] **CHANGELOG.md updated** with a `## [X.Y.Z] (YYYY-MM-DD)` section. `release.yml` publishes
      that section as the GitHub release notes (preview: `scripts/release-notes.sh X.Y.Z`).
- [ ] CI green: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, the Chromium widget sim.

### Tag: this is the step that publishes

- [ ] **Tag pushed after merge.** A bump without a tag publishes **nothing**, and
      produces no failing check to tell you so. Confirm they agree first:
      ```
      git describe --tags --abbrev=0                                  # newest tag
      node -p "require('./packages/sdk/package.json').version"        # what you bumped to
      git tag vX.Y.Z && git push origin vX.Y.Z
      ```

### VERIFY: the release is not done until this passes

A green workflow means *the job ran*. That is a claim about CI, not about npm.
Ask the registry:

- [ ] **`scripts/verify-release.sh` exits 0.** Same command CI runs in
      release.yml's verify step. It polls dist-tags, downloads the tarball npm
      actually serves, diffs its `src/` against this repo, and checks provenance:
      ```
      scripts/verify-release.sh
      ```
- [ ] **Spot-check by hand if you want the receipts** (this is what
      `verify-release.sh` automates):
      ```
      curl -sS https://registry.npmjs.org/-/package/customdomain-js/dist-tags
      curl -sS 'https://registry.npmjs.org/-/package/@customdomain%2freact/dist-tags'
      npm view customdomain-js@X.Y.Z dist.attestations
      ```
- [ ] **The OTHER distribution channel is current.** npm is only half of it: the
      hosted bundle ships from the product monorepo, as a copy of the vendored
      release that nobody refreshes for you. Vendor it there, commit, and deploy
      the product:
      ```
      cd /home/user/custom-domains
      scripts/vendor-sdk.sh X.Y.Z             # unpack both tarballs, copy the hosted bundle
      infra/scripts/check-bundle-fresh.sh    # vendored files and hosted bundle match SHA256SUMS
      ```

---

**Definition of done:** `scripts/verify-release.sh` exits 0 *and* the monorepo
vendors the release with `check-bundle-fresh.sh` passing. Anything less is `DISCLOSED-OPEN`, not FIXED; see
`docs/product/CROSS-REPO-COHERENCE.md` §5 in the product repo.
