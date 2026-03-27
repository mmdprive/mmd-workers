# OPERATIONS

## Purpose

This document defines how MMD should be operated in practice.

If `SYSTEM_OVERVIEW.md` explains what MMD is, and `INTERNAL_DOCTRINE.md` explains how MMD should think, then `OPERATIONS.md` explains how the platform should actually be run day to day.

This file is for people who operate, maintain, support, verify, and protect the system.

It is relevant to:
- operators
- admins
- developers
- reviewers
- support/control roles
- anyone making production-affecting changes

---

## Core operational principle

MMD should be operated as a controlled system, not as a collection of ad hoc actions.

That means:
- actions should happen through known surfaces
- workers should keep their boundaries
- truth should stay legible
- operators should understand what they are changing
- public experience should remain controlled even when the system is under stress

Rule:

**Operations in MMD are part of the system, not outside the system.**

---

## What operations means in MMD

Operations includes:

- reviewing system state
- checking workflow progress
- handling payment-related issues
- resolving session exceptions
- working through admin surfaces
- verifying deploy outcomes
- coordinating realtime incidents
- handling migration ambiguity
- keeping docs aligned with system reality

Operations is not only “support work.”  
It is the discipline that keeps MMD’s architecture trustworthy under real-world conditions.

---

## Operational layers

Operations in MMD happens across five layers.

### 1. Experience Layer
Surface where users or members interact with the system.

Includes:
- `chat-worker`
- TMIB character interface
- public-facing conversational or guided flows

Operational concern:
- keep the experience controlled
- do not leak internal confusion into public-facing moments
- ensure the public layer reflects actual backend truth

### 2. Core Production Layer
Where the main system logic runs.

Includes:
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

Operational concern:
- preserve source-of-truth integrity
- protect contracts
- avoid unsafe transitions
- keep state progression reliable

### 3. Real-time Layer
Where live interaction happens.

Includes:
- `realtime-worker`

Operational concern:
- support live coordination without corrupting canonical truth
- preserve recoverability if realtime fails or degrades

### 4. Migration Layer
Where imported or bridge workflows are managed.

Includes:
- `immigrate-worker`

Operational concern:
- isolate uncertainty
- do not let migration ambiguity silently overwrite core production truth

### 5. Operator Layer
Where people operate the system.

Includes:
- `Admin Console V1`

Operational concern:
- give operators control without bypassing the architecture
- make system state understandable before action is taken

---

## Operational surfaces

MMD should be operated through explicit surfaces, not through scattered guesswork.

Primary surfaces include:

### GitHub
Used for:
- code history
- docs history
- review
- commit traceability
- architecture accountability

### Cloudflare
Used for:
- runtime deployment
- worker execution
- binding/service configuration
- production verification

### Admin Console V1
Used for:
- operator-facing actions
- system visibility
- manual review
- controlled admin workflows

### System data / truth sources
Used for:
- inspecting actual records
- understanding canonical system state
- validating whether a flow succeeded or failed

Operators should always know which surface they are using, and why.

---

## Standard operational workflow

The default MMD operational sequence is:

**Inspect → Understand → Act → Verify → Record**

Expanded:

1. inspect the current system state
2. understand which layer is involved
3. confirm what action is allowed
4. act through the correct surface
5. verify whether the intended result occurred
6. record or communicate the outcome if operationally relevant

This sequence should be preferred over:
- assumption-based action
- repeated clicking
- memory-based troubleshooting
- silent manual intervention

---

## Daily operations doctrine

### 1. Start from truth
Before acting, determine:
- what the current state actually is
- which record is authoritative
- whether the issue is public-facing, operational, realtime, or architectural

### 2. Start with the smallest correct action
Do not escalate immediately to broad or destructive operations when a smaller verified action will do.

### 3. Prefer legibility over speed when uncertainty is high
Fast but unclear operations create larger future failures.

### 4. Prefer explicit action over hidden action
If something changed, it should be explainable.

### 5. Prefer bounded control over heroic improvisation
MMD should scale through controlled practice, not operator improvisation.

---

## Common operational modes

### A. Normal operations
The system is functioning normally and workflows proceed as expected.

Examples:
- session moving through expected stages
- payment verified correctly
- notifications delivering
- realtime room opening normally
- operator reviewing records without escalation

Focus:
- keep flow stable
- monitor correctness
- avoid unnecessary intervention

---

### B. Assisted operations
The system is functioning, but a person needs to help or confirm.

Examples:
- manual review of a payment edge case
- operator confirms a record or state
- migration data needs inspection
- exception requires controlled admin handling

Focus:
- preserve truth
- make the assisted action explicit
- avoid turning support action into undocumented system drift

---

### C. Recovery operations
The system encountered a failure, ambiguity, or broken flow.

Examples:
- invalid state transition attempt
- realtime degradation
- dependency issue
- contract mismatch
- partial notification failure
- migration/core conflict

Focus:
- stop unsafe continuation
- understand the issue
- restore control
- communicate clearly
- preserve recoverability

---

## Operator responsibilities

An operator in MMD should:

- understand which layer they are touching
- verify before advancing a sensitive workflow
- use approved surfaces
- preserve system truth
- escalate contract ambiguity instead of guessing
- communicate issues clearly
- avoid turning one-off manual action into an invisible policy

Operators are not expected to know every implementation detail.  
They are expected to respect the architecture.

---

## Developer responsibilities in operations

Developers in MMD are not outside operations.

When touching production-affecting code, a developer should:

- identify the affected worker/layer
- confirm whether contracts are involved
- update docs if system behavior changed
- deploy in the correct order
- verify post-deploy behavior
- preserve rollback clarity
- avoid boundary drift

A developer should not assume that code correctness alone equals operational safety.

---

## Admin responsibilities in operations

Admins operate at the authority layer and should:

- use `Admin Console V1` or approved admin routes
- respect worker boundaries
- distinguish between support action and architecture change
- preserve auditability
- confirm sensitive actions before execution
- avoid silently creating new operating norms through repeated workaround behavior

---

## Operational categories

### Session operations
Includes:
- inspecting session state
- verifying state transitions
- checking flow readiness
- confirming blocked stages
- handling exceptions around session progression

Key question:
**What state is the session truly in right now?**

### Payment operations
Includes:
- verification review
- payment status inspection
- session/payment relationship checks
- gate validation before work-critical stages

Key question:
**Is money truth confirmed, ambiguous, missing, or blocked?**

### Realtime operations
Includes:
- room opening checks
- connection/path verification
- live coordination troubleshooting
- determining whether realtime failure affects experience only or also coordination

Key question:
**Is the live layer degraded, or is core truth affected too?**

### Membership/admin operations
Includes:
- membership lifecycle changes
- access checks
- controlled admin actions
- authority-surface workflows

Key question:
**Is this an operator action, or a change to actual system truth?**

### Migration operations
Includes:
- inspecting incoming records
- validating imported states
- handling mapping uncertainty
- separating migration data from core truth

Key question:
**Is this real production truth yet, or still migration-layer material?**

---

## Operational escalation logic

Escalation should follow system seriousness, not emotion.

### Escalate when:
- production contracts are unclear
- state machine logic is at risk
- payment truth is ambiguous
- realtime issues are blocking critical workflows
- operator action could create irreversible confusion
- migration ambiguity is crossing into core production
- security or authority boundaries are involved

### Do not escalate immediately when:
- the issue is a normal validation failure
- the action can be retried safely
- the state is already clear
- the issue is operationally bounded and reversible

Escalation is for protecting the system, not for outsourcing basic verification.

---

## Operational checks before action

Before taking an action, confirm:

### 1. Surface
Where am I acting?
- GitHub
- Cloudflare
- Admin Console V1
- data truth source
- another controlled surface

### 2. Layer
Which layer is affected?
- experience
- core production
- realtime
- migration
- operator

### 3. Contract risk
Does this touch:
- `session_id`
- token parameter `t`
- worker boundaries
- payment gates
- state machine integrity
- source-of-truth assumptions

### 4. Recovery
If this goes wrong:
- can it be retried?
- can it be rolled back?
- will the resulting state still be legible?

---

## Operational checks after action

After taking an action, confirm:

### 1. Intended outcome
Did the thing you meant to change actually change?

### 2. State integrity
Did the system move into a valid state?

### 3. Downstream impact
Did any dependent worker or flow break?

### 4. Operator clarity
Can someone else understand what happened from records/logs/docs?

### 5. Public stability
Did the user-facing experience remain controlled?

---

## Operational anti-patterns

MMD should avoid these:

### 1. Operating from memory only
The current system state matters more than what someone remembers from last week.

### 2. Repeated blind retries
Retries without diagnosis can create ambiguity or duplicate effects.

### 3. UI-only truth
The operator surface should not replace actual source-of-truth validation.

### 4. Silent workaround culture
If the same manual fix is needed repeatedly, it should become explicit architecture or process — not invisible habit.

### 5. Boundary drift
Using one layer to secretly perform another layer’s job will eventually weaken the system.

### 6. Public calm built on internal chaos
The platform may need controlled messaging, but internal confusion still has to be resolved properly.

---

## Relationship to other docs

This file should be read with:

- `SYSTEM_OVERVIEW.md`
- `WORKERS.md`
- `REALTIME.md`
- `STATE_MACHINE.md`
- `LAYERS.md`
- `PRINCIPLES.md`
- `DEPLOYMENT.md`
- `ADMIN_CONSOLE_V1.md`
- `ERROR_HANDLING.md`
- `INTERNAL_DOCTRINE.md`

Together, these define:
- what the system is
- how it is built
- how it should think
- how it should be run

---

## One-line operational doctrine

**MMD operations should always preserve truth, respect boundaries, act through approved surfaces, and keep the system understandable under pressure.**
