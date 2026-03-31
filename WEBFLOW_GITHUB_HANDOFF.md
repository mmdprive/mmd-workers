## Source Of Truth

Use this repo workspace as the current source of truth for the admin surfaces.

- Local path: `/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers`
- Git branch: `codex/publish-ready-20260331`
- Current commit: `9458c3d`

## Ownership

- `admin-worker`
  - `/internal/admin/login*`
  - `/internal/admin/control-room*`
  - `/internal/admin/console*`
  - `/v1/admin/*`
- `immigrate-worker`
  - `/internal/jobs*`

## Webflow Note

Webflow does not auto-sync from this local path or from GitHub.

If someone updates Webflow custom code, embeds, or page wiring, they should reference this branch and these worker paths first so they do not accidentally rebuild against older routes or older worker ownership.

## Safe Working Rule

Before editing any admin/login/control-room/console flow:

1. Check out branch `codex/publish-ready-20260331`
2. Confirm `admin-worker` and `immigrate-worker` paths at repo root
3. Do not use older backup folders as implementation references

## Backup

Older local backup still exists at:

- `/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers-backup-20260331`

Do not treat that backup as the active source of truth.
