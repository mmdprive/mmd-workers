# ROUTES_AND_SURFACES

## Purpose

This document defines how MMD routes, entry points, and interface surfaces should be understood.

It explains:

- which routes act as front doors
- which surfaces are public, operator, or internal
- how routes relate to workers and layers
- how TMIB characters should appear across surfaces
- how user intent should be routed without weakening system clarity

This file exists to prevent a common mistake:

**treating every page, bot, or entry point as equal when they are not equal inside the architecture.**

---

## Core principle

In MMD, a route is not just a URL.

A route is a decision surface.

A surface is not just a screen.

A surface is the layer through which a person enters, understands, or acts on the system.

Rule:

**Routes should guide the correct user into the correct lane through the correct surface.**

---

## What routes and surfaces mean in MMD

### Route
A path, endpoint, or entry point that directs a person or system toward a specific experience or function.

Examples:
- `/trust/inme`
- `/start`
- `/join`
- payment verification routes
- realtime room URLs
- internal admin or worker endpoints

### Surface
The interface context through which interaction happens.

Examples:
- public trust page
- character-driven chat entry
- client dashboard
- model-facing dashboard
- Admin Console V1
- Telegram internal thread
- realtime live room
- backend worker route

A route answers:
**Where do I go?**

A surface answers:
**What kind of place am I in?**

---

## Route doctrine

MMD should not use routes as random destinations.

Each route should have:
- a clear audience
- a clear purpose
- a clear layer
- a clear expected next step

A route should not:
- mix client and model intent carelessly
- expose internal system surfaces to the public
- confuse trust-building with operations
- hide architectural boundaries behind sloppy navigation

---

## Surface doctrine

Every surface in MMD should belong to a recognizable layer.

### Experience surfaces
Public-facing, narrative, or guided entry surfaces.

### Operational surfaces
Used by operators, admins, or reviewers.

### System surfaces
Used by workers, integrations, or internal runtime logic.

### Realtime surfaces
Used during live coordination or room-based interaction.

### Migration surfaces
Used for bridge logic, imported records, or transitional flows.

Rule:

**A surface should express the layer it belongs to.**

---

## High-level route map

MMD should be understood as a multi-lane system, not a single path.

```txt
Public Trust / Entry
- /trust/inme
- /start
- package / FAQ / contact surfaces
- chat entry points

Client Continuity / Experience
- client-facing dashboard surfaces
- session continuity surfaces
- payment and support-linked routes

Model / Apply / Recruitment
- apply routes
- recruitment funnels
- model-facing intel surfaces
- model console/dashboard routes

Operator / Admin
- Admin Console V1
- controlled admin action surfaces

Realtime
- live room URLs
- room join and coordination surfaces

System / Internal
- worker routes
- verification routes
- internal automation routes
```

---

## Canonical public front door

### `/trust/inme`

`/trust/inme` should be treated as the **client-first trust entry surface**.

It is the front door for people who are ready to understand, trust, and enter the MMD system from the client side.

This means `/trust/inme` should primarily support:
- trust formation
- system understanding
- premium positioning
- path into chat / packages / payment / next guided step

It should not be overloaded with model-side logic as if both lanes are identical.

Important:

**`/trust/inme` is not the main recruitment surface.**  
It is the client-first front door.

A recruitment lane may be linked from it, but it should remain a secondary route, not the dominant route.

---

## Dual-lane routing model

Based on the latest MMD flow adjustment, MMD should be understood through two major external lanes.

### 1. Client Lane
For people entering to:
- understand MMD
- explore the offering
- build trust
- enter the guided chat/package/payment flow
- continue into client dashboards or session-linked surfaces

### 2. Model / Apply Lane
For people entering to:
- apply
- express interest in working with MMD
- move through scout/recruitment logic
- access model-side information or model-side control surfaces

These lanes should be related, but not merged into a single ambiguous front-end experience.

Rule:

**One front door may reveal more than one lane.  
It should not pretend the lanes are the same.**

---

## Character-to-surface alignment

TMIB characters are not decorative.  
They are interface roles.

But they must appear on the correct surfaces.

### Boss Per
Role:
- authority
- gate
- trust
- approval
- system ownership

Best surfaces:
- trust statements
- system-level framing
- premium entry tone
- controlled approval moments

Boss Per should feel like:
- authority behind the system
- selective entry
- high-trust framing

---

### Kenji
Role:
- client continuity
- warmth
- care
- polished premium guidance

Best surfaces:
- client continuity surfaces
- dashboard guidance
- after-entry support
- relationship-preserving client-facing routes

Kenji should feel like:
- premium reassurance
- continuity of care
- refined client-facing presence

---

### TarT
Role:
- scout
- selection
- model-side intelligence
- recruitment energy
- pre-reading potential

Best surfaces:
- model/apply lane
- recruitment flow
- audition / application surfaces
- model console intelligence layer
- client-brief-for-model interpretation surfaces

Important:

**TarT should not be the primary guide of the standard client purchase flow.**

TarT belongs more naturally in:
- recruitment
- model-side reading
- scout logic
- application routes

That means TarT should appear where MMD is selecting, evaluating, or guiding talent — not as the main face of the general client front door.

---

## Public experience surfaces

Public surfaces should remain controlled and legible.

These may include:
- trust pages
- landing pages
- package pages
- FAQ pages
- contact gateways
- character-led chat entries
- controlled application links

Public surfaces should do three things well:

### 1. clarify intent
Who is this for?

### 2. route correctly
Where should this person go next?

### 3. preserve tone
Does the surface feel like MMD?

Public surfaces should not:
- expose raw internal logic
- confuse client and model routes
- overcomplicate entry
- let character usage become random

---

## Client-facing surfaces

Client-facing surfaces include:
- `/trust/inme`
- package or offer exploration routes
- client chat entry
- session continuity surfaces
- support-linked client routes
- payment-linked guided routes
- client dashboard or client continuity pages

These surfaces should prioritize:
- trust
- clarity
- premium continuity
- next-step guidance
- controlled payment/session understanding

Best character alignment:
- Boss Per for authority/trust framing
- Kenji for continuity and warmth
- selective use of other characters only when intentional

---

## Model-facing surfaces

Model-facing surfaces include:
- apply / recruitment routes
- model onboarding paths
- model console/dashboard areas
- client intel for model
- briefing and expectation surfaces
- model-side exception or support surfaces

These surfaces should prioritize:
- readiness
- selection
- role clarity
- expectation shaping
- client-reading intelligence
- operational safety

Best character alignment:
- TarT for scout/recruitment/selection energy
- additional character use only when the model-side logic supports it

---

## Operator-facing surfaces

Operator-facing surfaces include:
- Admin Console V1
- internal dashboards
- internal review tools
- approval surfaces
- exception handling surfaces
- migration review surfaces

These surfaces should:
- make the system legible
- support action without bypassing boundaries
- preserve auditability
- separate support action from architecture drift

Characters are not the main focus here.  
Operator surfaces should favor clarity over narrative.

---

## Realtime surfaces

Realtime surfaces include:
- room open flows
- live room URLs
- room join surfaces
- live coordination links
- chat/location/live session layers

These surfaces belong to the realtime layer and should not be mistaken for primary source-of-truth surfaces.

Rule:

**Realtime surfaces coordinate live experience.  
They do not redefine canonical system truth by themselves.**

---

## System/internal surfaces

System/internal surfaces include:
- worker endpoints
- payment verification routes
- internal tokenized routes
- webhook or notify paths
- internal automation endpoints

These surfaces are not public navigation surfaces even if they are technically routable.

They should be treated as:
- controlled
- purpose-specific
- non-marketing
- non-narrative
- protected by architecture

---

## Route classification model

A helpful way to classify any route is to ask:

### 1. Audience
Who is this for?
- client
- model
- operator
- worker/system

### 2. Layer
Which layer does it belong to?
- experience
- core production
- realtime
- migration
- operator

### 3. Intent
What is the route trying to achieve?
- trust
- apply
- continue
- verify
- operate
- coordinate
- review
- recover

### 4. Next step
What should happen after entry?

If these are unclear, the route is probably underdefined.

---

## Route design rules

### 1. One route should have one primary job
A route may support secondary paths, but it should not have multiple equal identities.

### 2. Public routes should route, not dump
A route should guide the person toward the next action.

### 3. Surfaces should match the audience
Do not make a client-facing trust route feel like an operator console.
Do not make a model application route feel like a client purchase path.

### 4. Character use must match lane intent
Character placement should support routing clarity, not create confusion.

### 5. Internal routes should remain internal in meaning
Even when technically exposed, internal endpoints should not be treated as narrative UI surfaces.

### 6. Realtime routes should remain coordination-focused
They should support the live layer, not become accidental sources of canonical truth.

---

## Route anti-patterns

MMD should avoid:

### 1. Mixed-lane entry confusion
A route that tries to treat client booking and model recruitment as the same journey.

### 2. Decorative character use
Using characters in a way that looks cinematic but weakens routing clarity.

### 3. Internal/public blur
Presenting a system route like a public experience layer when it is not.

### 4. UI drift from architecture
Letting page structure imply responsibilities that the backend does not actually support.

### 5. Surface mismatch
Making a surface feel premium and human while actually dropping users into confusing operational flow.

---

## Recommended route map by lane

### Client lane
Suggested route family:
- `/trust/inme`
- `/start`
- packages
- FAQ
- contact / gateway
- chat entry
- payment-linked continuity routes
- client dashboard or continuity surfaces

Character emphasis:
- Boss Per
- Kenji

---

### Model / apply lane
Suggested route family:
- `/apply`
- `/join`
- recruitment-specific path
- audition / application surfaces
- model onboarding
- model-side dashboard
- model intel surfaces

Character emphasis:
- TarT

Important:
If the client-first trust surface includes a model/apply path, it should appear as a **secondary, explicit branch**, not as a merged primary narrative.

Example direction:
- “Not here to book? Apply to work with MMD.”

That preserves lane clarity without hiding the opportunity.

---

## Relationship to workers

Routes and surfaces should remain consistent with the worker architecture.

### `chat-worker`
Owns character-led public interaction surfaces.

### `payments-worker`
Supports payment verification and money-truth routes.

### `admin-worker`
Supports protected admin/control surfaces through approved backend logic.

### `events-worker`
Supports session flow progression and timeline-sensitive transitions.

### `telegram-worker`
Supports internal messaging surfaces only.

### `realtime-worker`
Supports live room and realtime coordination surfaces.

### `immigrate-worker`
Supports migration or bridge-oriented routes and transitional data paths.

A route should not imply a worker responsibility that the worker architecture does not support.

---

## Relationship to other docs

This file should be read together with:
- `SYSTEM_OVERVIEW.md`
- `WORKERS.md`
- `REALTIME.md`
- `STATE_MACHINE.md`
- `CHARACTERS.md`
- `LAYERS.md`
- `PRINCIPLES.md`
- `DEPLOYMENT.md`
- `OPERATIONS.md`
- `INTERNAL_DOCTRINE.md`
- `GLOSSARY.md`

Together, these define:
- what the system is
- how the layers work
- how the platform routes people
- how the public surface should stay aligned with architecture

---

## One-line definition

**Routes guide intent. Surfaces express layer. In MMD, both must work together to send the right person into the right lane without weakening the system.**
