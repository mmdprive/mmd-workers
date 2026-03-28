# MMD Big-Bang Immigration Rule
## Manual Notes Become Canonical Service History

**Status:** LOCKED  
**Owner:** Per  
**Domain:** Docs / Architecture / Migration / Admin Console / CRM  
**Effective Mode:** Big-Bang Immigration  

---

## 1. Purpose

This document defines the canonical rule for MMD's big-bang immigration phase.

During this phase, historical customer context does **not** primarily live in pre-existing canonical member records, because those records have not yet been fully migrated into the main system.

The most important customer history currently exists in **manual notes** ("note มือ"), including service history, prior interactions, special handling context, and operational memory.

Therefore, for this migration phase:

> **Manual notes become the canonical service-history seed for first-time member creation and promotion into the core system.**

This rule replaces the previous assumption that notes should be stored separately first and merged manually later.

---

## 2. Policy Statement

From this point onward, for the current big-bang immigration program:

1. **Manual notes are treated as canonical service-history input.**
2. **Merge-later logic is deprecated as a default workflow.**
3. **Migration records must be promoted into core early, not left in holding layers indefinitely.**
4. **If no canonical member already exists, the system should create one using migration payload plus manual notes as the first service-history source.**
5. **The migration layer becomes an intake-and-promotion layer, not a long-term resting place for important customer history.**

---

## 3. Scope

This rule applies to all customer records entering the system through immigration-related flows, including but not limited to:

- LINE-origin records
- renewal requests
- signup requests
- upgrade requests
- imported contact records
- operator-entered migration records
- legacy CRM / notebook / hand-maintained service history

This rule is specifically intended for the **big-bang immigration period** where canonical members are incomplete or absent.

---

## 4. Canonical Source Hierarchy During Big-Bang Immigration

During this migration phase, the source hierarchy is defined as follows:

### 4.1 For customers with **no existing canonical member**

The following may be used as canonical first-creation input:

- manual notes
- LINE ID
- LINE user ID
- legacy tags
- operator-entered context
- migration payload
- imported service history context

### 4.2 For customers with an **existing canonical member already created during this migration policy**

That canonical member becomes the primary system record going forward.

In that state:

- member record = active canonical identity
- member service history summary = active canonical service-history summary
- raw notes / imported notes = preserved archive and audit source

---

## 5. Deprecated Logic

The following logic is now deprecated for this migration program:

### Deprecated default
- receive migration payload
- store in inbox only
- wait for future manual merge
- reconstruct service history later by hand

### Reason for deprecation
This approach creates operational delay, loses context, fragments customer history, and forces repeated manual work.

For MMD, this is unacceptable because the most valuable customer history already exists inside manual notes.

---

## 6. New Canonical Workflow

The new architecture workflow is:

### Step 1 — Intake
Receive migration payload from source channel or admin input.

Typical fields may include:
- line_id
- line_user_id
- legacy_tags
- manual_note
- payload_json
- operator summary
- renewal / signup / upgrade intent

### Step 2 — Store raw intake
Store the raw payload in the migration / inbox layer for traceability and audit.

This preserves:
- original operator input
- original imported content
- original context from source channel
- migration provenance

### Step 3 — Identity check
Check whether a canonical member already exists.

### Step 4 — Promote if absent
If **no canonical member exists**, create a canonical member immediately using the migration payload.

This is the critical architecture rule.

The first canonical member record may be seeded from:
- line_id
- line_user_id
- legacy_tags
- manual notes
- operator-entered customer context
- imported service history

### Step 5 — Write canonical service history
At creation time, write a canonical service-history summary into the member record.

This summary is derived primarily from manual notes and migration context.

### Step 6 — Preserve raw archive
Preserve the original raw notes and payload in migration / internal-notes / archive layers.

### Step 7 — Continue business flow
Once promoted, all subsequent flows operate on the canonical member record:
- renew
- signup
- upgrade
- payment
- membership activation
- service operations
- CRM follow-up

---

## 7. Canonical Data Model Intent

During this policy window, the architecture intent is:

### Canonical member record stores
- identity
- active membership state
- operational status
- canonical service-history summary
- linked channel identifiers

### Internal notes / archive layers store
- raw manual notes
- imported legacy notes
- verbose operator history
- original payloads
- audit trace
- provenance

### Inbox / migration layer stores
- intake event
- source trace
- promotion trace
- pre-core raw context

In other words:

- **Member = active truth**
- **Notes archive = raw memory**
- **Inbox = intake + promotion trace**

---

## 8. Required System Behavior

The system should support the following behavior as part of the locked architecture:

1. Migration intake can receive manual notes as first-class input.
2. Manual notes are not treated as low-priority comments.
3. If no member exists, the system should create one instead of waiting for later merge.
4. Member creation must support importing service-history summary from manual notes.
5. Raw manual notes must still be retained in an archive-capable layer.
6. Renewal / signup / upgrade flows should be able to promote immigration records into member records.
7. Core business flows should operate on the canonical member immediately after promotion.

---

## 9. Exception Rule

This policy is an explicit exception to the older doctrine that migration data should not flow into core truth too early.

That older doctrine remains valid **when a stable canonical member truth already exists**.

However, in the current big-bang immigration phase, that condition is often **not true**.

Therefore:

> If no stable canonical member already exists, promotion from manual notes into core is permitted and required.

This is not considered unsafe overwrite.
This is considered **intentional first-truth creation**.

---

## 10. Architecture Interpretation

This rule does **not** collapse migration and core into the same layer.

Instead, it changes the responsibility of migration from:

- passive holding area

into:

- intake + trace + promotion layer

This preserves architecture discipline while eliminating unnecessary manual merge work.

---

## 11. Implementation Contract

The following implementation direction is now locked:

### 11.1 Membership-related intake pages
Pages such as:
- renew
- signup
- upgrade

must submit enough identity and note context to support immediate promotion.

### 11.2 Required payload philosophy
Payloads should prefer including:
- line_id
- line_user_id when available
- member identifier if known
- current tier / intended tier
- manual note or imported note context
- source channel
- intake intent

### 11.3 Promotion philosophy
The system should prefer:
- **create-and-promote now**

over:
- **store-and-merge later**

### 11.4 Summary generation
Where needed, the system may derive a structured service-history summary from manual notes for storage in the canonical member record.

### 11.5 Raw preservation
No raw manual note should be discarded during promotion.

---

## 12. Non-Goals

This policy does not mean:

- every noisy or low-confidence note must become user-facing truth
- raw archive should replace structured CRM fields
- future stable members should be overwritten carelessly
- the system should discard provenance or operator trace

The goal is not chaos.
The goal is **controlled canonical creation from the best available history source**.

---

## 13. Final Locked Rule

> **For the current MMD big-bang immigration phase, manual notes are the canonical service-history seed. If a canonical member does not yet exist, the system must prefer immediate promotion into core over delayed manual merge. Raw notes remain archived, but service history must not be trapped in migration holding layers.**

---

## 14. Operational Summary

Use this rule when deciding architecture and product behavior:

- If customer history lives in manual notes, treat those notes seriously.
- If no core member exists, create one.
- Do not wait for a future manual merge by default.
- Preserve raw data, but promote useful truth now.
- Renewal, signup, and upgrade should help immigration, not postpone it.

---

## 15. Lock Note

This document is intended to serve as the locked architecture direction for the current immigration program unless explicitly replaced by a newer approved policy.

