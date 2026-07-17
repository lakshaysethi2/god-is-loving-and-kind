# BLOCKED.md

## Item: P2.3 — CI workflow (GitHub Actions)

**Status:** BLOCKED — the sandbox GitHub token lacks `workflows` permission,
so `.github/workflows/ci.yml` cannot be pushed to the remote. The file exists
locally and is ready; it needs to be pushed by someone with the right token.

The file will be added to git and pushed automatically once the token is
refreshed/restored with `workflows` scope.
