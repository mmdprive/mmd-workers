# CHARACTERS

## Purpose

MMD does not present itself as a neutral interface.

The platform uses a **character layer** as the surface of the system, turning interaction into guided experience instead of generic UI behavior.

In practice, this means users do not only interact with a product.
They interact through **TMIB characters**.

## Role in the platform

Characters are part of the **Experience Layer**.
They do not replace system logic.
They express it.

```txt
System at the core
Character at the surface
Experience as the output
```

This is one of the most important distinctions in MMD:
- business logic stays shared and controlled
- personality changes the experience of the interface
- the system remains consistent underneath

## Current character set

The current TMIB character interface includes:
- Hito
- Hiro
- Hima
- Hiei
- Kenji
- Tart

These are not decorative mascots.
They are experience modes expressed through identity, tone, and interaction style.

## Architectural relationship

```txt
User
  ↓
TMIB Character Interface
  ↓
chat-worker
  ↓
Core Production Workers
  - payments-worker
  - admin-worker
  - events-worker
  - telegram-worker
  ↓
MMD Operating System
```

The character layer is primarily surfaced through `chat-worker`.

## Core rules

### 1. Character is interface, not authority
Characters shape the way the system is felt.
They do not change the underlying production truth.

### 2. Shared system, multiple personalities
All characters sit on top of the same operating system.
This preserves control and consistency.

### 3. No logic leakage
Character expression must not break worker boundaries or canonical business contracts.

### 4. Personality must remain intentional
A character should not feel random or generic.
Each one should deliver a distinct experience.

## Why the character layer matters

MMD is building an operating system with personality.
That means the interface must feel human without letting the system become chaotic.

The character layer helps MMD do three things at once:

### Trust
Users feel guided by someone, not abandoned inside a tool.

### Differentiation
MMD does not feel like a standard SaaS product, concierge bot, or booking flow.

### Emotional control
The system can shape tone, pace, and atmosphere while keeping the underlying mechanics stable.

## Character principles

### Character-first experience
Users should feel that they are entering through a person, not through a machine.

### System-first control
Even when the user experiences a character, the system underneath remains deterministic.

### Consistent canon
Characters should remain aligned with the TMIB universe and the approved MMD character canon.

## Relationship to `chat-worker`

`chat-worker` is the public-facing AI concierge layer.
It is the main place where the character system becomes visible to users.

This means:
- `chat-worker` delivers character expression
- core workers deliver system truth
- the platform stays unified under one architecture

## Product implication

MMD website and chat surfaces should be designed with the understanding that:
- users may choose who guides them
- the system may present interaction through character identity
- character selection is part of the experience layer, not an afterthought

## Design implication

When building interface surfaces, do not treat characters as campaign art only.
Treat them as interaction architecture.

That means:
- copy
- tone
- onboarding
- guidance
- trust signals
- choice architecture

all need to reflect the role of characters as part of the system.

## One-line definition

The TMIB character layer is the personality surface of MMD — the human-facing interface through which users experience a controlled operating system.
