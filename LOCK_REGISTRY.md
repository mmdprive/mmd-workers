# MMD Lock Registry (Hard / Soft / Unlocked)

**Date:** 2026-03-13 (Asia/Bangkok)  
**Owner / Approver:** Per  
**Scope:** MMD Membership Dashboard + membership/points/add-on policy + updates widget + core system contracts

This document defines what is **Hard Locked**, what is **Soft Locked**, and what is intentionally **Unlocked** so we can move fast without breaking core production contracts.

---

## How to use this registry

- **Hard Lock** = do not change unless Per explicitly re-approves (treat as production contracts).
- **Soft Lock** = default rule for the project; can evolve with a short note + version bump.
- **Unlocked** = intentionally flexible; choose what fits the current implementation.

---

## Change rules

### Hard Lock change (requires explicit re-approval)
1) Open a PR that updates this file (`LOCK_REGISTRY.md`)  
2) Add: reason, risk, migration plan, and affected endpoints/data  
3) Per approves (explicit)  
4) Announce in internal Telegram forum: **Membership thread (TG_THREAD_MEMBERSHIP=20)**

### Soft Lock change (fast iteration)
1) Update this file with: what changed + why + date  
2) Add a short “Migration note” if breaking UI/fields  
3) Announce briefly in Membership thread (20)

### Unlocked area (no formal approval needed)
- Keep documentation updated if it affects other workstreams.

---

## Registry

### A) Unlocked (remove from Hard Lock now)
These were “too hard too early” and slow down delivery. Keep them flexible.

1. **Dashboard endpoint naming** (e.g. `/refresh` vs `/sync-me` vs `/member/self/*`)  
   - Rule: keep a stable client-facing route via proxy/adaptor; naming can change behind it.

2. **Single-axis membership tier model** (trying to force Standard→Premium→VIP→SVIP→Black Card as one ladder)  
   - Rule: we now use a multi-axis model (see Soft Locks).

3. **Black Card = package_code only**  
   - Rule: Black Card is an **add-on** now; implementation can be record/flag/ledger.

4. **Points expiry policy + thresholds** (exact expiry duration / 1200 / 2500)  
   - Rule: treat as config; we can iterate.

5. **EN-only UI**  
   - Rule: keep EN-only for now, but it is not a forever contract.

6. **Updates (announcements) Airtable schema v1**  
   - Rule: schema can evolve; backend should adapt to keep API contract stable.

7. **Health checks must be complete day 1**  
   - Rule: start best-effort (Memberstack+Groups first), add Drive/Telegram later.

---

### B) Soft Locks (recommended defaults, can evolve)
These should be the **default project assumptions** so we don’t reintroduce confusion.

1. **Membership model = 3 axes**
   - **Base membership:** `Standard | Premium`
   - **Consideration:** `VIP | SVIP` (eligible/approved) derived from points
   - **Add-on:** `Black Card` (purchase add-on 35,000)

2. **Dashboard authority = admin-worker**
   - Dashboard can read Memberstack for display,
   - but **sync/repair/provisioning/health** must be orchestrated by **admin-worker**.

3. **Dashboard response shape (versioned)**
   - Stable top-level shape: `member, membership, points, addons, health, recommended_actions, server_time`
   - Can add fields anytime; avoid removing fields without a migration note.

4. **Points presentation always shows**
   - `lifetime_points` (prestige) + `active_points` (eligibility)
   - VIP/SVIP eligibility uses **active_points**.

5. **Black Card add-on policy**
   - Add-on can have `expire_at`
   - Add-on does **not** change base membership
   - Black Card access comes only from add-on activation.

6. **Updates API contract is stable**
   - `GET /api/v1/member/updates/list?limit=...`
   - `POST /api/v1/member/updates/mark-seen`
   - Backend adapts storage/schema as needed.

---

### C) Hard Locks (do not change without re-approval)
These are core production contracts and security boundaries.

1. **Core production contracts**
   - `session_id` is the primary idempotency/session reference
   - token parameter must be `t`
   - KV indexed by token signature (not full token)
   - canonical session/payment state machine and idempotency guards

2. **Worker boundaries + secrets**
   - **admin-worker** is the only holder of `MEMBERSTACK_SECRET_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON`
   - payments-worker is payment/points awarding only
   - telegram-worker is internal/system gateway only
   - chat-worker is public AI concierge layer (channel interface)

3. **Airtable Base/Table IDs + critical Field IDs**
   - Treat as immutable production wiring; changes require migration plan + re-approval.

4. **Telegram internal routing constants**
   - Chat ID + thread IDs (confirm/points/membership) stay stable to avoid message routing failures.

5. **Payments/Webhook spec v2**
   - Verification, auth, audit trails, and idempotency rules stay stable.

6. **Auth separation**
   - `/login` uses Memberstack public app ID only; server secrets stay server-side only.

7. **Ledger integrity**
   - Do not “edit history” silently; any correction should be an auditable entry (adjust/expire) or logged override.

---

## Announcement procedure (required)
Whenever a **Hard Lock** changes:
- Update this file + add a migration note
- Post a short announcement to internal Telegram forum: **Membership thread (20)**

