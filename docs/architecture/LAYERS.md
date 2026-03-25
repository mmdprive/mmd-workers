# MMD Layers

## Purpose

This document explains the major layers of the MMD operating system and how they relate to each other.

MMD is not a single app or a single worker. It is a layered system designed to control human experience through interface, orchestration, real-time coordination, migration, and operator control.

At the highest level, MMD follows one core principle:

**System at the core. Character at the surface. Experience as the output.**

---

## Layer Model

```txt
MMD Operating System

Experience Layer
Core Production Layer
Real-time Layer
Migration Layer
Operator Layer
```

Each layer has a different purpose. The system stays stable because each layer has a clear boundary.

---

## 1. Experience Layer

The Experience Layer is the surface users interact with.

It includes:
- `chat-worker`
- TMIB character interface
- web and other public-facing entry channels

This layer is where MMD feels human.

Users do not simply interact with a neutral system. They interact through characters, tone, and guided flows. That is why the Experience Layer is not just UI — it is the personality surface of the operating system.

### Main responsibility
- receive user intent
- guide user interaction
- express system behavior through character and tone

### Important rule
The Experience Layer should not become the source of truth. It is the interface layer, not the authority layer.

---

## 2. Core Production Layer

The Core Production Layer is the main business engine.

It includes:
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

This layer controls the truth of business operations, state transitions, and system authority.

### Main responsibility
- payment truth
- admin authority
- session/job orchestration
- internal notifications

### Important rule
This layer must remain clean and deterministic. It should not be polluted by migration shortcuts or presentation logic.

---

## 3. Real-time Layer

The Real-time Layer handles live session coordination.

It includes:
- `realtime-worker`

This layer exists because some experiences cannot rely only on request/response or delayed automation. They require active room state, live messaging, location flow, and real-time coordination.

### Main responsibility
- websocket rooms
- live session tokens
- live coordination between participants
- real-time interaction during an active session

### Important rule
The Real-time Layer supports the core system, but does not replace the source of truth. Persistent business truth still belongs to the core production system.

---

## 4. Migration Layer

The Migration Layer handles movement from legacy or bridge workflows into the canonical system.

It includes:
- `immigrate-worker`

This layer exists so that legacy flows, external sources, or intermediate bridge logic do not contaminate the production core.

### Main responsibility
- move data into the main system
- bridge transitional flows
- support system migration without breaking production contracts

### Important rule
Migration logic must stay clearly separated from core production logic.

---

## 5. Operator Layer

The Operator Layer is the human control surface used by admins and operators.

It includes:
- `Admin Console V1`

This is where people inside the organization inspect, control, and operate the system.

### Main responsibility
- operator visibility
- internal controls
- admin actions
- system oversight

### Important rule
The Operator Layer is not the business engine itself. It is the control surface used to interact with the engine.

---

## How the layers work together

```txt
User / Member
    ↓
Experience Layer
    ↓
Core Production Layer
    ↓
Real-time Layer (when needed)
    ↓
Operator Layer (for oversight and control)

Migration Layer runs beside the core system,
feeding data and workflows into the canonical platform.
```

This is not a strict visual stack in every request path, but it is the clearest way to understand system responsibility.

---

## Boundary Rules

### Experience vs Core
- experience expresses
- core decides

### Core vs Real-time
- core owns business truth
- real-time owns live coordination

### Core vs Migration
- core is canonical
- migration is transitional

### Core vs Operator
- core runs the system
- operator layer controls and observes the system

---

## Why this matters

Without clear layers, MMD would become a mix of UI logic, migration shortcuts, internal tools, and business state all tangled together.

The layered model protects the system by making each part legible:
- users understand the experience surface
- developers understand the system boundary
- operators understand the control surface
- migration stays separate from production truth

---

## Final definition

MMD is a layered operating system with personality.

- The **Experience Layer** makes it human.
- The **Core Production Layer** makes it reliable.
- The **Real-time Layer** makes it live.
- The **Migration Layer** makes transition possible.
- The **Operator Layer** makes control visible.

Together, these layers allow MMD to scale controlled human experience without collapsing into chaos.
