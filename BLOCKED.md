# BLOCKED.md

## Item: P2.3 — CI workflow (GitHub Actions)

**Status:** BLOCKED — the sandbox GitHub token lacks `workflows` permission,
so `.github/workflows/ci.yml` cannot be pushed to the remote. The file exists
locally and is ready; it needs to be pushed by someone with the right token.

**Workaround:** The file is correct and can be pushed via the GitHub UI or a
local clone with a personal access token that has `workflows` scope.
