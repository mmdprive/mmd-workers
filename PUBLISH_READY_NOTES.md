This workspace is the safest handoff point for the current admin/login/console flow.

Base:
- Created from `origin/feat/immigrate-worker`
- Branch: `codex/publish-ready-20260331`
- Base commit: `53f2069`

Restored on top from the local stash `codex-sync-before-pull-20260331`:
- `admin-worker`
- `immigrate-worker`
- `apps/web-client`
- `admin-console-V1`

Why this exists:
- The original repo is ahead of GitHub and contains work that should not be overwritten blindly.
- The latest GitHub copy alone does not include the newer admin/login/console ownership changes.
- This workspace keeps the latest GitHub baseline while preserving the current worker-based admin flow.

Recommended next step:
- Review and test from this workspace before any publish or deploy action.

Route checklist in this workspace:
- `admin-worker` owns `/internal/admin/login*`
- `admin-worker` owns `/internal/admin/control-room*`
- `admin-worker` owns `/internal/admin/console*`
- `admin-worker` owns `/v1/admin/*`
- `immigrate-worker` owns `/internal/jobs*`
