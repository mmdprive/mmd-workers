# DEPLOYMENT

## Purpose

This document defines how MMD changes should move from draft to production.

It is not only a technical deploy checklist.  
It is the operating rule for how MMD protects production contracts while continuing to evolve the system.

MMD deploys in this order:

**Local → GitHub → Cloudflare**

That rule exists to protect:
- worker boundaries
- production contracts
- rollback ability
- documentation accuracy
- operator confidence

---

## Deployment principle

MMD should never deploy directly from idea to production.

Every change must pass through three layers:

### 1. Local
This is where work is created, reviewed, and checked.

Use local for:
- editing code
- editing docs
- validating file paths
- reviewing structure
- checking worker scope
- confirming which layer is affected

### 2. GitHub
This is the canonical record of change.

Use GitHub for:
- version control
- commit history
- pull requests
- code review
- diff visibility
- architecture traceability

### 3. Cloudflare
This is production execution.

Use Cloudflare for:
- deploying worker code
- updating runtime behavior
- publishing live system changes
- verifying production behavior

---

## Core deployment rule

**Do not deploy to Cloudflare before the change exists cleanly in GitHub.**

That means:
- file paths must already be correct
- final code must already exist in repo history
- docs should already reflect the change if architecture or behavior changed

---

## Change types

### Documentation-only changes
Examples:
- `README.md`
- `docs/architecture/*.md`

Deployment path:
**Local → GitHub**

Cloudflare is not required unless the docs are part of a separately deployed web surface.

### Worker code changes
Examples:
- `workers/chat-worker`
- `workers/payments-worker` when moved
- `workers/admin-worker`
- `workers/events-worker` when moved
- `workers/telegram-worker` when moved
- `workers/realtime-worker` when moved
- `workers/immigrate-worker`

Deployment path:
**Local → GitHub → Cloudflare**

### Configuration changes
Examples:
- `wrangler.toml`
- worker routes
- environment variable names
- bindings
- Durable Object references
- queues / cron / KV / R2 / D1 / service bindings

Deployment path:
**Local → GitHub → Cloudflare**, with extra caution

### Architecture changes
Examples:
- worker responsibility changes
- flow/state changes
- realtime layer changes
- migration/core boundary changes
- token or session contract changes

Deployment path:
**Local → Docs update → GitHub → Review → Cloudflare**

Architecture must never change silently.

---

## Required pre-deploy checks

Before any deploy, confirm:

### Scope
- What changed?
- Which worker or layer is affected?
- Is this docs-only, code, config, or architecture?

### Contract safety
- Does this touch `session_id` behavior?
- Does this touch token parameter `t`?
- Does this change Airtable assumptions?
- Does this change worker boundaries?
- Does this affect realtime room behavior?
- Does this change operator/admin expectations?

### Documentation alignment
If the answer is yes to any architecture question above:
- update the relevant docs first or in the same change set

Relevant docs may include:
- `SYSTEM_OVERVIEW.md`
- `WORKERS.md`
- `REALTIME.md`
- `STATE_MACHINE.md`
- `LAYERS.md`
- `PRINCIPLES.md`
- `INTERNAL_DOCTRINE.md`

---

## Recommended deployment flow

### A. Docs-only deploy

1. Draft locally
2. Validate file names and paths
3. Commit to GitHub
4. Verify rendering on GitHub
5. Done

Recommended commit style:
- `docs: ...`
- `docs(architecture): ...`

---

### B. Worker code deploy

1. Draft locally
2. Confirm affected worker
3. Confirm no boundary violation
4. Update docs if behavior changed
5. Commit/push to GitHub
6. Review diff
7. Deploy target worker to Cloudflare
8. Verify runtime behavior
9. Verify dependent workers are not broken
10. Record outcome

---

### C. Multi-worker deploy

Use this when one change affects more than one worker.

Sequence:
1. deploy foundational/shared changes first
2. deploy upstream control layers next
3. deploy downstream consumer layers after
4. verify integration end-to-end

Guidance:
- If payment truth changes, verify `payments-worker` first
- If state flow changes, verify `events-worker` and downstream notifications
- If user-facing behavior changes, verify `chat-worker` after the core dependency is safe
- If live session behavior changes, verify `realtime-worker` and any workers that open or consume room links

---

## Production-safe rollout order

When a change spans multiple layers, prefer this mental order:

### 1. Contracts
Anything that affects core production assumptions.

### 2. Core control workers
- `payments-worker`
- `admin-worker`
- `events-worker`

### 3. Internal messaging / coordination
- `telegram-worker`
- `realtime-worker`

### 4. Public interface
- `chat-worker`

### 5. Migration or bridge logic
- `immigrate-worker`

Reason:
public surfaces should usually move after the core behavior behind them is already correct.

---

## Verification after deploy

After deploying a worker, verify three levels:

### 1. Runtime health
- worker responds
- route is reachable
- no immediate runtime error

### 2. Functional behavior
- expected endpoint works
- payload/response still matches expectation
- secrets/bindings are available
- routing and auth still behave correctly

### 3. System behavior
- downstream worker interactions still work
- no state machine breakage
- no messaging breakage
- no realtime breakage
- no operator confusion

---

## Docs and deployment must stay linked

For MMD, code and docs are not separate worlds.

If a deployment changes:
- architecture
- flow
- roles
- worker boundaries
- realtime behavior
- core production contracts

then the docs must be updated as part of that same delivery.

Rule:

**No architecture-changing deploy should land without documentation alignment.**

---

## Cloudflare deployment discipline

Cloudflare is where live behavior changes.  
Because of that, it should be treated as the final step, not the working area.

Use Cloudflare only after:
- local review is complete
- GitHub history is correct
- deploy target is confirmed
- bindings/secrets are understood
- rollback path is known

Do not use Cloudflare as the place where the team “figures out what changed.”

---

## Rollback mindset

Every deploy should assume rollback may be needed.

Before deploy, know:
- which worker changed
- which commit introduced the change
- whether the change touched contracts or only implementation
- whether rollback is safe independently or must be paired with another worker rollback

If uncertain, treat rollback as multi-layer until proven otherwise.

---

## Deployment by file category

### Root docs
Examples:
- `README.md`
- `docs/architecture/*.md`

Path:
**Local → GitHub**

### Worker implementation files
Examples:
- `index.js`
- `src/*`
- `lib/*`

Path:
**Local → GitHub → Cloudflare**

### Worker configuration
Examples:
- `wrangler.toml`

Path:
**Local → GitHub → Cloudflare**, with extra verification

### Console/UI documentation
Examples:
- `Admin Console V1` docs

Path:
**Local → GitHub**
Deploy only if the UI itself is separately shipped

---

## MMD standard workflow

The default workflow for the team is:

**Draft → Local check → GitHub → Deploy → Verify**

Expanded:

1. Draft the change
2. Check structure locally
3. Check architecture impact
4. Update docs when needed
5. Commit to GitHub
6. Review the final diff
7. Deploy the correct target
8. Verify production behavior
9. Record or communicate outcome

---

## Operational rules

### Always do
- deploy from known code
- keep docs aligned
- confirm worker scope before deploy
- verify after deploy
- preserve clean commit history
- separate docs-only changes from runtime changes when possible

### Never do
- deploy from memory only
- skip GitHub history
- change architecture silently
- mix migration assumptions into core without making it explicit
- deploy public behavior before the core behind it is ready

---

## One-line deployment doctrine

**Local is where MMD checks. GitHub is where MMD records. Cloudflare is where MMD executes.**
