# GLOSSARY

## Purpose

This document defines the shared vocabulary of MMD.

MMD is a layered system with workers, flows, contracts, character interfaces, operator surfaces, and migration boundaries. Because of that, the team must use words consistently.

This glossary exists to reduce ambiguity across:
- architecture discussions
- product decisions
- implementation work
- docs writing
- operator communication
- change management

Rule:

**If the team uses the same words differently, the system will drift even when the code does not.**

---

## How to use this file

Use this glossary when:
- writing or reviewing docs
- naming architecture concepts
- discussing system behavior
- deciding whether a change is local or architectural
- explaining flows to operators or developers
- checking whether a term belongs to the core, the interface, or the migration layer

This file is not meant to replace deeper docs.
It is meant to keep shared language stable.

---

## A

### Access
The permissions, membership level, or system allowances that determine what a person can enter, use, or control.

### Admin Console V1
The operator-facing control surface of MMD.
It is not a worker and not the authority engine itself. It is the human-facing interface used to inspect, review, and trigger approved actions through the system.

### Admin surface
A human-facing interface used for controlled administrative action.
In MMD this is primarily represented by Admin Console V1.

### `admin-worker`
The backend authority and orchestration layer of MMD.
It handles admin actions, structured operational control, membership/access workflows, and other protected system responsibilities.

### Architecture
The conceptual structure of the system: layers, workers, contracts, flows, and boundaries.
Architecture is not only code structure. It includes how the platform is supposed to behave.

### Authority layer
The part of the system that is allowed to approve, mutate, or enforce protected actions.
In MMD, `admin-worker` and some Boss Per moments represent authority at different surfaces.

---

## B

### Black Card
A premium expression of the MMD ecosystem.
It is not the full definition of MMD, but one high-tier experience/access layer inside the broader operating system.

### Boundary
A rule that defines what a worker, layer, or surface is allowed to do.
A strong boundary prevents drift, hidden coupling, and accidental architecture collapse.

### Boss Per
The authority-facing character function in the MMD interface world.
Used for gatekeeping, trust, invitation, approval, and controlled authority moments rather than routine continuity.

---

## C

### Canonical
The approved or official version of a rule, flow, contract, or structure.
If something is canonical, it should be treated as the reference point until formally changed.

### Channel-agnostic
A system design approach where Telegram, LINE, web, and future apps are treated as surfaces or channels, not as the core system itself.

### `chat-worker`
The public-facing AI concierge and interface layer of MMD.
This worker sits at the experience layer and expresses the system through TMIB characters rather than through a neutral bot voice.

### Character layer
The interface layer where the system is expressed through TMIB characters.
This is where users feel personality, mood, and relational guidance, while the core logic remains system-controlled.

### Change management
The discipline of controlling how MMD evolves.
A change is not complete when code changes alone; it is complete when implementation, docs, and operations still describe the same system.

### Client Lane
The customer-facing route through the MMD system.
This lane is typically led by Boss Per at authority moments and by Kenji for continuity and care.

### Cloudflare
The production execution layer used to run live worker code and runtime behavior.
In MMD, Cloudflare is the final step in the standard flow: Local → GitHub → Cloudflare.

### Contract
A production rule or assumption that other parts of the system depend on.
Examples include token usage, session references, worker boundaries, route expectations, and source-of-truth assumptions.

### Core
The system layer where truth, logic, state, and worker responsibilities actually live.
This is different from the public-facing surface.

### Core Production Layer
The layer containing the main control workers of MMD:
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

---

## D

### Dashboard
A user-facing or operator-facing view that presents the current status and next action context for a person in the system.

### Deploy / Deployment
The act of moving approved code or runtime changes into live production.
In MMD, deployment is governed by the rule: Local → GitHub → Cloudflare.

### Doctrine
A higher-level system philosophy that guides how MMD should think and act.
Doctrine is broader than a feature spec and closer to system truth.

### Documentation alignment
The rule that when architecture, flow, or behavior changes, the related docs must also change so that the written system still matches the real system.

### Drift
The condition where code, docs, practice, or mental models no longer describe the same system.
MMD treats drift as a serious architecture risk.

---

## E

### Error handling
The system discipline for preserving truth, stopping unsafe flow, maintaining operator clarity, and keeping MMD recoverable when things go wrong.

### Events / event-driven flow
A pattern where system progression is driven by meaningful actions or state changes rather than static pages alone.
In MMD this is strongly represented in session and job automation.

### `events-worker`
The session/job automation engine of MMD.
It manages timeline progression, state transitions, reminders, and flow-control logic across operational stages.

### Exception
A case where the normal automated or expected path is not enough.
Exceptions require review, controlled handling, or recovery logic.

### Experience Layer
The user-facing layer of MMD where the system is felt.
This includes `chat-worker`, TMIB characters, and public interaction surfaces.

---

## F

### Flow
A guided sequence of meaningful states, actions, and transitions.
MMD is flow-driven, not just feature-driven.

### Front door
The primary entry surface into a lane or system path.
For example, `/trust/inme` is a client-facing front door in the broader MMD experience logic fileciteturn13file1.

---

## G

### Gate / Gatekeeping
A controlled checkpoint that determines whether a person, action, or state is allowed to proceed.
Boss Per often represents this in the character layer; payment and state rules represent it in the system layer.

### GitHub
The canonical record of change for MMD.
Used for history, review, docs alignment, and visible system evolution.

### Glossary
A controlled vocabulary file used to keep the team aligned on system meaning.
This file is that glossary.

---

## H

### Handoff
A controlled transition from one surface, worker, or state into another.
Example: trust page → chat flow, or payment confirmed → next operational state.

### Hard lock
An assumption, rule, or contract that should not be changed casually.
Hard locks generally represent production-critical truths.

### Hiei / Hima / Hito / Hiro
TMIB characters used as selectable or contextual experience-layer guides.
They shape mood, tone, and route feel, but they do not replace the system core.

---

## I

### IA (Information Architecture)
The structure of routes, sections, pages, and navigation logic used to guide a person through the platform.

### Idempotency
The property that repeating the same allowed operation should not create duplicate truth or duplicate side effects.
In MMD, this matters heavily for session, payment, and event-driven logic.

### `immigrate-worker`
The migration worker of MMD.
It exists to move or bridge data and workflows into the main production system without polluting the core.

### Internal only
A classification meaning the surface or worker is not meant to be publicly exposed.
`telegram-worker` is an example of an internal/system-only worker.

### Interface layer
The layer users see and feel.
In MMD, this is often expressed through characters, guided routes, and public-facing flows.

---

## J

### Job
A concrete operational unit of service execution, often linked to session progression, coordination, or live handling.

---

## K

### Kenji
The continuity, warmth, and care function of the MMD character layer on the client side.
Kenji is suited to concierge guidance, flow continuity, booking context, payment follow-through, pre-service handling, and aftercare fileciteturn13file3.

### KV
A key-value storage pattern used for runtime state or lookup behavior where appropriate.
In MMD, KV may support token/session-related flows or worker runtime coordination.

---

## L

### Lane
A distinct path through the system designed for a different type of user or purpose.
Examples include Client Lane and Model / Apply Lane.

### Layer
A structural band of responsibility in the platform.
Examples include Experience Layer, Core Production Layer, Real-time Layer, Migration Layer, and Operator Layer.

### Legibility
The quality of the system being understandable to humans.
A legible system makes state, intent, failure, and next actions clear.

### Local
The first stage in the standard MMD workflow.
Local is where files are drafted, reviewed, and checked before they become recorded in GitHub or executed in Cloudflare.

---

## M

### Memberstack
The public auth and membership layer used by MMD.
It is not the back-office source of truth.

### Migration Layer
The layer responsible for moving legacy, imported, or bridge workflows into the main production system without confusing them with canonical truth.

### Model / Apply Lane
The recruitment and model-facing route of MMD.
This lane is best aligned with TarT as the scout/recruitment/interface figure and Boss Per as final authority fileciteturn13file0 fileciteturn13file1.

### Mood layer
The tonal or experiential flavor expressed by the selected character interface, without changing the underlying system truth.

### MMD
The broader operating system for controlled human experience.
MMD is larger than any single product, tier, page, or character.

---

## O

### Operating system with personality
A concise definition of MMD.
It means the platform is system-controlled at the core, but expressed through character and relational surface at the interface.

### Operations
The discipline of running MMD in practice: inspecting truth, acting through approved surfaces, verifying outcomes, and preserving system clarity.

### Operator
A person responsible for reviewing, handling, or controlling system behavior through approved administrative surfaces.

### Operator Layer
The architecture layer where human operators act on the system.
In MMD this is represented primarily by Admin Console V1.

---

## P

### Package
A structured offering or access level within MMD, such as Standard, Premium, or Black Card.
A package is part of the user-facing offering, not the full architecture itself.

### Payment gate
A controlled checkpoint that blocks certain state transitions until payment truth is confirmed.
This is especially important between service readiness and work-critical states.

### `payments-worker`
The money-truth and payment lifecycle worker of MMD.
It handles payment verification, payment state, and the coupling between payment and session truth.

### Personal Assistant / PA
A continuity role at the interface layer.
In current MMD character logic, Kenji is the clearest fit for this client-facing continuity function fileciteturn13file3.

### Principle
A guiding rule that helps decisions remain aligned even when implementation details change.

### Production contract
A contract that matters in live system behavior and should not be changed casually.

### Public-facing
A surface designed for users, members, or customers to interact with directly.

---

## R

### Real-time Layer
The live coordination layer of MMD.
This layer supports live rooms, chat/location signaling, and other in-session real-time behavior.

### `realtime-worker`
The worker responsible for live interaction infrastructure such as WebSocket rooms and real-time session coordination.

### Recoverability
The system property that allows MMD to retry, inspect, escalate, or roll back safely after a failure or change.

### Recruitment path
The route used to invite, screen, and onboard people who want to work with MMD.
TarT is the correct front-facing character function for this lane, not the general client purchase flow fileciteturn13file0.

### Reviewable
A property of change or action meaning another person can inspect what happened and understand it.

### Route
A directed path through the interface or system.
A route may be literal (page path) or conceptual (experience flow).

---

## S

### `session_id`
The primary session and idempotency reference used in MMD production logic.
It is one of the most important system contracts.

### Session
A core unit of service flow in MMD.
Sessions move through states and are tied to payments, timing, preparation, coordination, and completion logic.

### Soft lock
A temporarily stabilized decision or direction that may still evolve with controlled approval.

### Source of truth
The system source whose state should be treated as canonical over derived views or convenience surfaces.
In back-office logic, Airtable often serves this role.

### State
A meaningful operational condition in the system.
Examples include confirmed, reminder, arrived, work_started, or payout-related positions in a state machine.

### State machine
The controlled model that defines which transitions are allowed, when, and under what conditions.
MMD treats state machines as core flow truth, not just UI behavior.

### Surface
A place where the system is presented, controlled, or interacted with.
Examples: public interface, Admin Console V1, GitHub, Cloudflare.

### System at the core. Character at the surface. Experience as the output.
A core MMD principle describing the relationship between architecture, interface, and user experience.

### System truth
The actual state of the platform as represented by the approved source-of-truth systems and contracts.

---

## T

### TarT
The scout, recruitment, and model-intelligence function in the MMD character layer.
TarT should live in recruitment, model console, and client-intel-for-model contexts rather than as a front-facing guide for normal client purchase flow fileciteturn13file0 fileciteturn13file1.

### Telegram Preview
A surface or channel entry point that may guide users toward the broader system but is not the full system core.

### `telegram-worker`
The internal system messaging worker of MMD.
This worker is internal-only and not meant to act as the public chatbot surface.

### TMIB
The character/story universe used as the interface expression layer of MMD.
TMIB provides identity, tone, and relational surface without replacing worker-based system truth.

### Token parameter `t`
The canonical token parameter used in MMD production contracts.
Changing this casually would count as a contract-sensitive change.

### Trust flow / trust entry
A controlled entry path used to orient people before routing them deeper into the correct lane or surface.
`/trust/inme` has been treated as a client-first front door, with secondary apply paths branching from it fileciteturn13file1.

---

## U

### Unlock
A controlled action or moment where the system or authority layer allows a person to proceed to the next meaningful state, lane, or privilege level.

---

## V

### Verification
The act of confirming that a state, payment, deployment, or operation truly succeeded and is legible in the system.

### Visible
A quality of change or system behavior meaning it can be seen, reviewed, and reasoned about instead of remaining hidden in implicit behavior.

---

## W

### Worker
A bounded backend unit with a specific responsibility in the MMD architecture.
Workers should not casually take on each other’s roles.

### Worker boundary
The rule that one worker should not silently perform another worker’s responsibility.
This is one of the most important structural protections in MMD.

### Workflow
A repeatable way of moving through action and state in the system.
A workflow may involve multiple workers, surfaces, and operator actions.

---

## Writing rule

When choosing between two terms, prefer the term that best preserves architecture clarity.

Examples:
- say **operator surface** instead of “admin thing”
- say **migration layer** instead of “temporary stuff”
- say **contract change** instead of “small tweak” when production rules are involved
- say **character layer** instead of “theme” when a TMIB role changes the interface meaningfully

---

## Relationship to other docs

This glossary should be read with:
- `SYSTEM_OVERVIEW.md`
- `WORKERS.md`
- `REALTIME.md`
- `STATE_MACHINE.md`
- `LAYERS.md`
- `PRINCIPLES.md`
- `DEPLOYMENT.md`
- `ADMIN_CONSOLE_V1.md`
- `ERROR_HANDLING.md`
- `OPERATIONS.md`
- `CHANGE_MANAGEMENT.md`
- `INTERNAL_DOCTRINE.md`

---

## One-line glossary doctrine

**Shared language is part of system integrity.**
