# INFORMATION_ARCHITECTURE

## Purpose

This document defines the information architecture of MMD.

If `ROUTES_AND_SURFACES.md` explains how people should be routed, and `CLIENT_LANE.md` / `MODEL_LANE.md` explain the logic of each lane, then `INFORMATION_ARCHITECTURE.md` explains how the web and system-facing information should be organized so the whole platform remains legible.

This file answers questions like:
- what major sections should exist
- how the site should separate client and model intent
- where trust, package, application, continuity, and operator surfaces belong
- how page structure should reflect architecture rather than obscure it

Rule:

**Information architecture should reduce confusion before interface design even begins.**

---

## Core principle

MMD should not be organized like a random website made of disconnected pages.

Its information architecture should reflect:
- the layered architecture of the platform
- the distinction between client and model lanes
- the difference between public, operator, realtime, and system surfaces
- the need for trust before progression
- the need for continuity after entry

Rule:

**A page tree is part of the system design, not just a content list.**

---

## What information architecture means in MMD

Information architecture in MMD includes:
- page families
- route families
- lane separation
- content hierarchy
- primary and secondary entry points
- continuity surfaces
- operator-facing sections
- relationship between public explanation and system progression

It is not only about menus.  
It is about making sure the structure of information supports the structure of the operating system.

---

## IA doctrine

A strong MMD information architecture should:

- make the client-first path obvious
- make the model/apply path available without confusing the client path
- keep operator surfaces separate from public surfaces
- keep internal/system routes out of public IA
- preserve premium tone through structure, not just styling
- support continuity after entry, not only attraction before entry

A weak IA is one that:
- merges incompatible intents
- makes users guess where to go
- hides architecture behind vague page labels
- treats every user as the same user
- turns trust entry into a cluttered mixed-purpose page

---

## High-level IA model

MMD should be understood through five major information domains:

### 1. Public Trust Domain
Pages that explain, position, and invite entry.

### 2. Client Domain
Pages and flows for clients moving from trust to continuity.

### 3. Model Domain
Pages and flows for application, recruitment, and model continuity.

### 4. Operator Domain
Pages and tools for internal/admin use.

### 5. System / Runtime Domain
Non-public, non-marketing routes and machine surfaces.

These domains are related, but they should not be collapsed into one flat page tree.

---

## Recommended top-level structure

A strong information architecture for MMD can be thought of like this:

```txt
Public Trust Domain
- /trust/inme
- package / offer understanding
- FAQ / support explanation
- contact / gateway
- chat entry

Client Domain
- client continuity pages
- session-linked client pages
- payment-linked client pages
- dashboard-style continuity surfaces

Model Domain
- /apply
- /join
- recruitment / expectation pages
- model intelligence surfaces
- model continuity or dashboard surfaces

Operator Domain
- Admin Console V1
- internal review surfaces
- exception handling / admin control surfaces

System / Runtime Domain
- worker routes
- verification routes
- realtime room URLs
- internal automation routes
```

---

## Primary public entry

### `/trust/inme`

`/trust/inme` should remain the **primary public trust entry** of MMD.

In information architecture terms, this means:

- it is the front door of the Public Trust Domain
- it should introduce MMD from the client-first perspective
- it should guide the visitor toward the next appropriate lane
- it should not behave like a mixed-purpose sitemap dump

Its primary tasks:
- explain what MMD is
- establish trust
- create premium orientation
- guide toward chat, package understanding, or next-step action

Its secondary task:
- reveal the model/apply branch in a clean, explicit way

---

## Domain 1 — Public Trust Domain

## Purpose
The Public Trust Domain exists to make MMD understandable before it becomes transactional or operational.

## Typical page families
- `/trust/inme`
- package overview surfaces
- FAQ surfaces
- introductory offer explanation
- contact / gateway pages
- chat entry surfaces

## Primary audience
- new client
- curious visitor
- evaluating prospect

## Tone
- premium
- calm
- selective
- legible
- guided

## IA rule
This domain should answer:
- What is MMD?
- Why should I trust it?
- What should I do next?

---

## Domain 2 — Client Domain

## Purpose
The Client Domain exists to carry a client from trust into continuity.

It should include the information and surfaces needed for:
- next-step progression
- payment-linked clarity
- session-linked continuity
- support
- relationship preservation

## Typical page families
- client continuity pages
- session-linked client pages
- package-specific clarification pages
- payment-linked support surfaces
- dashboard or continuity-style pages

## Primary audience
- confirmed or progressing client
- returning client
- client in motion through the system

## Tone
- clear
- reassuring
- premium
- stable
- continuity-preserving

## IA rule
The Client Domain should feel like the same world as the trust entry, not an unrelated utility layer.

---

## Domain 3 — Model Domain

## Purpose
The Model Domain exists for application, selection, expectation shaping, and model-side continuity.

This domain should not be buried, but it also should not dominate the client-first entry experience.

## Typical page families
- `/apply`
- `/join`
- recruitment explanation
- expectation-setting pages
- model-side onboarding surfaces
- model intelligence surfaces
- model continuity or dashboard pages

## Primary audience
- applicant
- recruited model
- model in active continuity flow

## Tone
- selective
- intelligent
- observant
- clear
- role-shaping

## IA rule
The Model Domain should feel distinct from the client purchase path while still belonging to the same system.

---

## Domain 4 — Operator Domain

## Purpose
The Operator Domain exists for people running the system.

This domain is not part of the public information architecture, even if it exists in the broader product environment.

## Typical page families
- Admin Console V1
- internal review pages
- admin dashboards
- exception handling interfaces
- migration review surfaces

## Primary audience
- admin
- operator
- reviewer
- support/control role

## Tone
- clear
- operational
- low-noise
- trustworthy
- audit-friendly

## IA rule
Operator pages should optimize legibility and control, not narrative or marketing.

---

## Domain 5 — System / Runtime Domain

## Purpose
This domain includes routes and surfaces that are part of system execution rather than user-facing IA.

## Typical page families
- worker endpoints
- internal tokenized routes
- payment verification endpoints
- notify/webhook routes
- realtime room URLs
- migration/internal automation routes

## Primary audience
- workers
- internal systems
- integrations
- runtime logic

## IA rule
These routes should not be treated as part of public navigation architecture even if they are technically addressable.

---

## Lane-based IA logic

The MMD web and related surfaces should be organized around lanes.

### Client Lane
Client-first progression:
- trust
- offer understanding
- chat
- payment/session-linked continuity
- client continuity surfaces

### Model Lane
Model-first progression:
- apply
- recruitment
- expectation shaping
- model-side intelligence
- model continuity

These lanes should be:
- related
- findable
- visibly distinct
- structurally coherent

Rule:

**Users should not need to decode lane identity from vague labels.**

---

## Recommended public site architecture

A public-facing IA could be organized like this:

```txt
/trust/inme
    - what MMD is
    - why trust it
    - primary CTA into client lane
    - secondary branch into model lane

/client
    - package / offer clarity
    - continuity pages
    - payment/session-linked surfaces
    - dashboard-style continuity surfaces

/apply
    - application entry
    - recruitment framing
    - expectation shaping
    - model-side continuation

/contact or /start
    - controlled gateway into guided interaction
```

This is a structural recommendation, not a required final URL scheme.  
The core point is that the information architecture should reflect lane separation.

---

## Page hierarchy rules

### 1. One page family should have one dominant user intent
A page family may support branching, but its main purpose should stay clear.

### 2. Trust should come before complexity
Do not lead with operational detail when trust framing is still incomplete.

### 3. Continuity pages should not feel accidental
After entry, people should still know where they are and why.

### 4. Model pages should not be hidden inside client language
Recruitment should have explicit route identity.

### 5. Operator pages should stay outside public IA
Do not mix internal/admin pages into the public web hierarchy.

### 6. Runtime routes are not content architecture
System endpoints should not be mistaken for part of web IA.

---

## Character implications for IA

Characters should not be assigned to pages randomly.

### Boss Per
Best IA role:
- trust framing
- authority surfaces
- premium gate tone

### Kenji
Best IA role:
- client continuity pages
- relationship-preserving client surfaces
- dashboard or guidance continuity

### TarT
Best IA role:
- apply/recruitment pages
- model-side intelligence surfaces
- model continuity where scouting or selective interpretation matters

Rule:

**Character assignment should support the information architecture, not decorate over unclear structure.**

---

## Navigation implications

Navigation should support lane clarity.

Recommended principle:

### Primary navigation
Should prioritize:
- trust
- entry
- core understanding
- high-value next steps

### Secondary navigation
Should reveal:
- apply / model lane
- FAQ
- support explanations
- additional informational content

### Protected/internal navigation
Should remain separate:
- operator tools
- admin surfaces
- runtime/system paths

---

## IA anti-patterns

MMD should avoid:

### 1. Flat architecture
Everything at the same level with no distinction between audience or lane.

### 2. Mixed client-model narrative
One entry surface pretending both intents are the same.

### 3. Pretty but directionless navigation
Premium styling without informational clarity.

### 4. Public pages that secretly behave like internal utilities
Confusing operational surfaces for user-facing IA.

### 5. Character-led clutter
Using multiple characters in a way that confuses the intended next step.

### 6. Continuity collapse
Strong entry pages followed by weak post-entry structure.

---

## Relationship to architecture docs

This file should be read with:
- `ROUTES_AND_SURFACES.md`
- `CLIENT_LANE.md`
- `MODEL_LANE.md`
- `CHARACTERS.md`
- `WORKERS.md`
- `LAYERS.md`
- `STATE_MACHINE.md`
- `PRINCIPLES.md`
- `OPERATIONS.md`
- `GLOSSARY.md`

Together, these define:
- how MMD is structured
- how users are routed
- how information is grouped
- how public and internal surfaces stay distinct

---

## One-line definition

**MMD information architecture should make the system understandable by structuring trust, lanes, continuity, and control into clearly separated but connected domains.**
