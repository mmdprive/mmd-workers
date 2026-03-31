## Admin Surface Update

Use this repo and branch as the current source of truth:

- Local path: `/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers`
- Branch: `codex/publish-ready-20260331`
- Commit: `8e993ab`

Current route ownership:

- `admin-worker`
  - `/internal/admin/login*`
  - `/internal/admin/control-room*`
  - `/internal/admin/console*`
  - `/v1/admin/*`
- `immigrate-worker`
  - `/internal/jobs*`
  - immigration/backend routes only

Important:

- Do not rebuild admin pages against older worker ownership.
- Webflow does not auto-sync from this repo or branch.
- Before changing Webflow embeds, custom code, login flow, console flow, or control-room flow, check this branch first.

Suggested message to share:

```text
Admin surfaces have been consolidated.

Source of truth:
- repo path: /Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers
- branch: codex/publish-ready-20260331

Current ownership:
- admin-worker: /internal/admin/login*, /internal/admin/control-room*, /internal/admin/console*, /v1/admin/*
- immigrate-worker: /internal/jobs* plus immigration/backend routes only

Please do not reference older worker ownership or older local backup folders when editing Webflow custom code, embeds, login, console, or control-room flows.
```
