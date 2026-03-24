Node.JS SDK for Freeplay AI

# Publishing the SDK

All publishes go through the **Publish** GitHub Actions workflow, which uses
[npm trusted publishing](https://docs.npmjs.com/generating-provenance-statements)
via GitHub OIDC — no long-lived npm tokens are involved.

## How to publish

1. For a **stable** release, bump the version in `package.json` and merge to `main`.
2. Go to **Actions → Publish → Run workflow** on the `main` branch.
3. Select the release type (`prerelease` or `stable`). Use `dry_run` to verify first.

The workflow will:
- Run the full test suite
- Build the package
- Publish to npm **with provenance attestation** (OIDC, no secrets)
- Create a GitHub Release and tag

## Security controls

| Control | Detail |
|---------|--------|
| **Trusted publishing** | `id-token: write` + `--provenance` — npm verifies the package was built in this repo's CI |
| **Environment protection** | The `npm-publish` GitHub Environment can have required reviewers and branch restrictions |
| **Pinned actions** | All third-party Actions are pinned to full commit SHAs to prevent tag-hijacking |
| **Branch gate** | The publish job only runs when triggered from `main` |
| **No manual publish** | Do **not** run `npm publish` locally. The `prepublishOnly` script is for local dev/test only. |
