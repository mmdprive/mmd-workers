# ADMIN_CONSOLE_V1

## Purpose

This document defines the role of **Admin Console V1** inside the MMD system.

Admin Console V1 is the operator-facing control surface of MMD.  
It is not the core production engine itself, and it is not a worker.

Its job is to give operators and admins a controlled surface for viewing, checking, triggering, and managing system actions that are executed by backend workers.

---

## What Admin Console V1 is

Admin Console V1 is the **human-facing administrative interface** of MMD.

It exists so that an operator can:
- inspect system data
- review operational status
- trigger approved admin actions
- validate flows
- resolve exceptions
- work with migration data when needed
- operate the platform without directly editing backend code

In simple terms:

**`admin-worker` is the authority layer.**  
**Admin Console V1 is the operator surface.**

---

## Position inside the architecture

Admin Console V1 belongs to the **Operator Layer**.

```txt
MMD Operating System

Experience Layer
- chat-worker
- TMIB character interface

Core Production Layer
- payments-worker
- admin-worker
- events-worker
- telegram-worker

Real-time Layer
- realtime-worker

Migration Layer
- immigrate-worker

Operator Layer
- Admin Console V1
```

This means Admin Console V1 should not be treated as a replacement for worker logic.

It sits above the workers and interacts with them through controlled backend routes.

---

## Core principle

Admin Console V1 should make the system easier to operate **without weakening system boundaries**.

That means:
- operators can act through the console
- the console does not become a hidden second backend
- real authority still belongs to backend workers
- production contracts remain enforced behind the UI

Rule:

**The console may surface control. It must not bypass control.**

---

## Relationship with `admin-worker`

Admin Console V1 and `admin-worker` are related, but they are not the same thing.

### `admin-worker`
- backend authority
- system orchestration
- protected internal/admin actions
- membership and access operations
- structured writes into operational systems

### Admin Console V1
- operator-facing interface
- review and execution surface
- visual layer for admin workflows
- controlled action initiator
- visibility layer for system state

The console should call `admin-worker` or other approved workers through explicit routes.  
It should not redefine business rules in the UI.

---

## What the console should do

Admin Console V1 should help operators with tasks like:

### 1. Operational visibility
- view current records
- inspect session/payment/admin states
- understand what happened
- see current status before acting

### 2. Controlled actions
- trigger approved admin operations
- confirm or advance known workflows
- apply manual corrections when allowed
- run safe support actions

### 3. Exception handling
- handle cases where automation is not enough
- support operator review
- make system state legible
- reduce confusion during irregular cases

### 4. Migration support
- inspect incoming migrated data
- validate imported states
- support controlled migration workflows
- help distinguish between migration-layer data and core production truth

---

## What the console should not do

Admin Console V1 should **not** become:

### 1. A hidden second backend
Business logic should not live only inside the console UI.

### 2. A replacement for worker boundaries
The UI should not directly bypass `payments-worker`, `events-worker`, `realtime-worker`, or `telegram-worker` contracts.

### 3. An unlogged manual override zone
Sensitive actions must still be traceable and controlled.

### 4. A place where architecture drifts silently
If the console changes how the system is operated, related docs should also change.

---

## Console responsibilities

Admin Console V1 is responsible for:

- presenting controlled operational context
- helping operators understand system state
- triggering approved backend actions
- reducing operator friction
- improving operational safety
- supporting manual review where needed
- making edge cases manageable

It is **not** responsible for:
- redefining system rules
- replacing state machine logic
- holding production truth independently
- owning worker-to-worker architecture

---

## Recommended console sections

Admin Console V1 should be thought of as a set of operator surfaces.

Example sections may include:

### Dashboard
High-level system status and operational visibility.

### Sessions / Jobs
View and inspect session and job states.

### Payments
Review payment records, verification states, and payment-linked session context.

### Membership / Access
Review and manage membership lifecycle through approved backend flows.

### Migration / Inbox / Imported Records
Handle immigration-layer records and migration-related review.

### Internal Notes / Logs
Support operator traceability and administrative context.

### Exceptions / Manual Review
Handle non-standard cases through controlled workflows.

---

## Data and truth model

Admin Console V1 must not invent its own reality.

Its displayed state should come from approved system sources.

In practice:
- Airtable-backed operational truth remains system truth
- worker-produced state remains system truth
- the console is a surface for reading and acting on that truth

Rule:

**If the console view and system truth disagree, system truth wins.**

---

## Security posture

Because Admin Console V1 is an operator surface, it should be treated as sensitive.

Key security expectations:

- restricted access
- explicit authentication
- role-aware actions where needed
- no unsafe public exposure
- no direct privilege leakage into the browser
- no uncontrolled write operations

Important:

**Admin Console V1 should expose capability, not raw backend power.**

---

## UI doctrine

The console should feel:

- clear
- controlled
- low-noise
- operational
- trustworthy
- efficient under pressure

It should not feel:
- decorative
- overloaded
- ambiguous
- overly clever
- dependent on operator memory

This is an admin tool, not a marketing surface.

---

## Relationship to documentation

Changes to Admin Console V1 may require updates to:

- `SYSTEM_OVERVIEW.md`
- `WORKERS.md`
- `LAYERS.md`
- `PRINCIPLES.md`
- `INTERNAL_DOCTRINE.md`
- `DEPLOYMENT.md`
- `STATE_MACHINE.md`

Especially when the console changes:
- who can act
- how actions are triggered
- what operational state is visible
- how exceptions are resolved
- how migration data is handled

---

## Operational rule

If an operator action changes system behavior, that action should still respect:

- worker boundaries
- production contracts
- state machine rules
- auditability
- source-of-truth assumptions

The console is allowed to simplify operations.  
It is not allowed to erase system discipline.

---

## One-line definition

**Admin Console V1 is the operator-facing control surface of MMD: a human interface for acting on the system without bypassing the system.**
