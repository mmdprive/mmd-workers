# ERROR_HANDLING

## Purpose

This document defines how MMD should handle errors, exceptions, broken flows, and operational uncertainty across the platform.

In MMD, error handling is not just about catching failures.  
It is about preserving control when the system encounters ambiguity, interruption, or inconsistency.

The goal is not only to recover.  
The goal is to keep the platform legible, safe, and operational under pressure.

---

## Core principle

MMD should never treat errors as isolated technical events only.

An error may affect:
- worker behavior
- state machine integrity
- payment truth
- realtime coordination
- operator trust
- customer experience
- migration boundaries

Rule:

**An error is a system event, not just a code event.**

---

## Error handling doctrine

MMD should respond to errors in this order:

### 1. Protect truth
Do not corrupt core system truth.

### 2. Protect flow
Do not allow broken transitions to silently continue.

### 3. Protect operator clarity
Make the problem understandable to the person who must respond.

### 4. Protect recoverability
Preserve the ability to retry, inspect, escalate, or roll back.

### 5. Protect trust
Avoid exposing chaos to the wrong surface.

---

## What error handling means in MMD

A good error-handling pattern in MMD should:

- stop unsafe progression
- preserve state integrity
- expose enough context for debugging
- avoid silent corruption
- avoid misleading success
- keep worker boundaries intact
- make recovery possible
- make operator action explicit when needed

A bad pattern is one that:
- hides failure
- advances flow anyway
- writes ambiguous state
- loses context
- leaks raw internal confusion into public interfaces
- creates drift between system truth and operator perception

---

## Error categories

### 1. Validation errors
The request or action is structurally invalid.

Examples:
- missing required fields
- malformed payload
- invalid token format
- wrong parameter names
- unsupported event type

Expected handling:
- reject clearly
- do not mutate state
- return actionable error context
- keep logs legible

---

### 2. Authorization / permission errors
The caller is not allowed to perform the action.

Examples:
- invalid internal token
- missing admin authority
- unauthorized operator action
- unsafe public call into internal surface

Expected handling:
- deny the action
- do not partially process
- avoid leaking protected internals
- preserve auditability

---

### 3. Contract errors
A request violates a production contract.

Examples:
- wrong token parameter usage
- invalid `session_id` behavior
- mismatched payment/session coupling
- illegal state transition
- crossing worker boundaries in unsupported ways

Expected handling:
- hard stop
- surface contract mismatch clearly
- do not guess or auto-correct silently
- escalate for review if contract ambiguity exists

---

### 4. State machine errors
The requested action does not match the allowed current state.

Examples:
- trying to start work before final payment gate
- trying to confirm a session already completed
- attempting transition from the wrong state
- duplicated event in a non-idempotent context

Expected handling:
- reject transition
- preserve current state
- log attempted transition
- expose enough detail for operator review

---

### 5. Realtime errors
The live layer is unavailable, incomplete, or inconsistent.

Examples:
- room token issue
- room open failure
- websocket disruption
- missing live coordination data
- partial realtime join behavior

Expected handling:
- degrade safely
- do not corrupt core session truth
- preserve the session even if live coordination is impaired
- escalate to operator if live function is operationally required

---

### 6. Payment errors
Money truth is missing, inconsistent, duplicated, or invalid.

Examples:
- verification failure
- duplicate payment attempt
- ambiguous receipt
- mismatched session/payment reference
- missing final payment confirmation at gate point

Expected handling:
- stop financially sensitive transition
- preserve payment truth
- never fake completion
- require explicit operator/admin review when ambiguity remains

---

### 7. External dependency errors
A dependency fails or becomes unavailable.

Examples:
- Airtable issue
- Memberstack issue
- Telegram delivery issue
- Cloudflare binding/runtime issue
- third-party verification issue

Expected handling:
- fail safely
- isolate dependency failure from broader corruption
- retry where safe
- escalate where dependency is business-critical
- keep system truth consistent even when external propagation fails

---

### 8. Migration errors
The migration layer introduces ambiguity or incomplete mapping.

Examples:
- imported data shape mismatch
- incomplete source mapping
- unknown legacy state
- conflict between migration records and core truth

Expected handling:
- isolate migration uncertainty
- do not let migration data silently overwrite core truth
- mark for review
- preserve separation between immigration/migration layer and core production layer

---

### 9. Operator errors
A person makes an incorrect or incomplete action through the console.

Examples:
- wrong record selected
- duplicate manual action
- action taken without reading context
- unsafe override attempt

Expected handling:
- design UI to reduce mistakes
- require confirmation for sensitive actions
- preserve auditability
- prefer reversible actions where possible
- avoid silent destructive flows

---

## Error handling by layer

## Experience Layer
Includes:
- `chat-worker`
- TMIB character interface

Rules:
- do not expose raw internal stack confusion to the user
- keep public-facing responses controlled and understandable
- do not pretend success when the backend failed
- if uncertainty exists, communicate safely without leaking internals

Public-facing output should feel stable even when the backend is under stress.

---

## Core Production Layer
Includes:
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

Rules:
- preserve source-of-truth integrity
- reject unsafe transitions
- keep worker boundaries enforced
- record meaningful failure context
- avoid partial writes that create ambiguous reality

This layer must favor correctness over convenience.

---

## Real-time Layer
Includes:
- `realtime-worker`

Rules:
- live failures must not silently corrupt session truth
- degrade gracefully when live coordination breaks
- preserve inspectability
- keep realtime state separate from core operational truth unless explicitly committed

---

## Migration Layer
Includes:
- `immigrate-worker`

Rules:
- migration failure must remain isolated
- migration ambiguity must not rewrite core truth by accident
- imported data should be reviewable
- uncertain mappings must be surfaced, not hidden

---

## Operator Layer
Includes:
- `Admin Console V1`

Rules:
- the operator must be able to understand what failed
- actions should expose context before execution
- sensitive actions should confirm intent
- the console must not become a place where confusion is hidden by UI polish

---

## Error severity model

MMD should think in levels of severity:

### Level 1 — recoverable local issue
A small issue with low blast radius.

Examples:
- validation failure
- malformed request
- retryable public input issue

Response:
- reject cleanly
- no state mutation
- no escalation unless repeated

---

### Level 2 — operationally relevant issue
The system remains up, but flow or operator handling is affected.

Examples:
- Telegram notify failure
- realtime join issue
- non-critical dependency disruption
- retryable downstream problem

Response:
- preserve truth
- allow controlled retry
- log for operator visibility

---

### Level 3 — state or contract risk
There is a risk of corrupting system truth or breaking production contracts.

Examples:
- illegal state transition
- payment/session mismatch
- ambiguous payment truth
- contract violation
- migration/core conflict

Response:
- hard stop
- escalate
- require explicit review before continuing

---

### Level 4 — critical system integrity issue
The problem threatens system correctness, deploy safety, or platform trust.

Examples:
- contract-breaking deploy
- cross-worker corruption
- broad source-of-truth inconsistency
- destructive unauthorized action
- severe auth/security failure

Response:
- halt unsafe operations
- contain blast radius
- escalate immediately
- verify integrity before resuming

---

## Design rules for handlers

When implementing handlers, prefer these rules:

### 1. Fail closed, not open
If uncertain, stop unsafe continuation.

### 2. Preserve current truth
Do not overwrite known-good state with ambiguous state.

### 3. Be explicit about failure
A rejected action should say why it was rejected at the appropriate surface.

### 4. Prefer idempotent recovery
Retries should not create duplicate truth.

### 5. Separate public messaging from internal detail
Users need controlled clarity. Operators need actionable detail.

### 6. Log what matters
The log should help answer:
- what failed
- where it failed
- what state was involved
- whether the system mutated or not
- what should happen next

### 7. Do not silently “fix” contract problems
Contract ambiguity is an escalation event, not an auto-magic repair opportunity.

---

## State-machine-specific rules

Because MMD is flow-driven, state errors matter more than ordinary UI errors.

When a state-related error happens:

- preserve the current state
- reject illegal transition
- record attempted transition
- expose operator-readable context
- do not create “half-transitioned” reality

Important:

**No state transition should succeed merely because a request was made.  
It should succeed only because the current state, rules, and dependencies allow it.**

---

## Payment-specific rules

Payments are truth-sensitive.

When handling payment errors:

- do not infer money truth from incomplete signals
- do not allow work-critical transitions without required payment gates
- do not merge ambiguous payment events automatically
- preserve idempotency
- escalate ambiguous financial states quickly

Important:

**Financial ambiguity must block sensitive flow progression.**

---

## Realtime-specific rules

Realtime is important, but it should not own production truth by accident.

If realtime fails:
- preserve the main session
- keep operator visibility high
- retry safely where possible
- do not let live coordination failure rewrite canonical state silently

Important:

**Realtime failure should degrade experience, not redefine truth.**

---

## Operator-facing error design

Operators should be able to answer these questions quickly:

- What failed?
- Which layer failed?
- Did the system state change?
- Is it safe to retry?
- Is this a contract issue or an operational issue?
- Does this require escalation?

Admin surfaces should show:
- enough context to act
- enough warning to avoid making it worse
- enough clarity to distinguish normal delay from actual failure

---

## Logging and audit mindset

Error handling without traceability is incomplete.

At minimum, important failures should preserve:
- time
- worker/layer
- affected record or state reference
- action attempted
- outcome
- whether mutation occurred
- who or what initiated the action
- whether escalation is needed

The goal is not just debugging.  
The goal is operational memory.

---

## Recovery doctrine

Recovery in MMD should follow this order:

### 1. Stop unsafe continuation
### 2. Preserve truth
### 3. Make the issue legible
### 4. Decide whether retry is safe
### 5. Escalate if the issue crosses contract boundaries
### 6. Resume only after the system is understandable again

Recovery is successful only when the system is both functional and interpretable.

---

## Relationship to other docs

This file should be read together with:
- `WORKERS.md`
- `REALTIME.md`
- `STATE_MACHINE.md`
- `LAYERS.md`
- `PRINCIPLES.md`
- `DEPLOYMENT.md`
- `ADMIN_CONSOLE_V1.md`
- `INTERNAL_DOCTRINE.md`

Error handling is not isolated from architecture.  
It is one of the main ways architecture proves itself under stress.

---

## One-line definition

**MMD error handling exists to preserve truth, stop unsafe flow, protect operator clarity, and keep the system recoverable under pressure.**
