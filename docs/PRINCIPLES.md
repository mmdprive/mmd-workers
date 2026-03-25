# MMD Principles

This document defines the core principles that guide how MMD is designed, built, and operated.

These principles are not style preferences. They are operating rules for the platform.

## 1. System over improvisation

MMD exists to reduce chaos in human-driven operations.

Where traditional service businesses rely on individuals improvising in real time, MMD replaces that uncertainty with system-defined flow, state, and control.

**Principle:** if a recurring human action can be made predictable, it should be expressed as a system rule.

## 2. Character at the surface, system at the core

MMD does not present itself as a neutral interface.

Users encounter the platform through TMIB characters and guided experience. But personality is the surface layer, not the decision engine.

**Principle:** character may shape how the experience feels, but system contracts determine what is true.

## 3. Flow over isolated features

MMD should not be designed as a pile of disconnected features.

Every capability must belong to a broader operational flow: onboarding, payment, live coordination, job execution, review, or admin control.

**Principle:** new features must map to an existing flow or justify the creation of a new one.

## 4. State is reality

The platform must always know what state a session, payment, or membership is in.

The canonical state machine is what prevents ambiguity between humans, channels, and workers.

**Principle:** if a process matters operationally, it must have an explicit state model.

## 5. Source of truth must stay singular

Back-office reality should not be fragmented across multiple uncontrolled systems.

Airtable remains the operational source of truth for transactions and workflow state, while Memberstack remains the public auth and membership shell.

**Principle:** avoid duplicating authority. One system owns one truth.

## 6. Worker boundaries are production contracts

Workers exist to preserve responsibility boundaries.

`payments-worker` should not become a membership authority.
`telegram-worker` should not become a public chatbot.
`chat-worker` should not silently absorb backend business logic.

**Principle:** responsibility separation is part of the production contract, not an implementation detail.

## 7. Real-time is a layer, not an exception

Live coordination is not an ad hoc add-on.

Real-time interaction belongs to a dedicated layer, expressed through `realtime-worker`, so that live chat, location, and coordination can be governed consistently.

**Principle:** live behavior must be designed as infrastructure, not patched into unrelated services.

## 8. Migration must not pollute the core

MMD evolves through migration and bridge phases, but temporary layers must not redefine the core system.

`immigrate-worker` and any migration bridge logic exist to move workflows into the main operating model, not to permanently distort it.

**Principle:** migration supports the core; it does not replace it.

## 9. Operator tools are part of the system

Internal operators are not outside the architecture.

`Admin Console V1` is part of how the operating system is used in practice. A platform is not complete if only its APIs are designed.

**Principle:** operational interfaces must be treated as first-class system surfaces.

## 10. Control without visible friction

MMD aims to feel premium, calm, and human on the surface while remaining strict and deterministic underneath.

The user should feel guided, not constrained. But the system should still enforce truth, order, and timing.

**Principle:** the best control systems feel invisible to the user while remaining exact internally.

## 11. Channels may change; the operating model should not

Web, LINE, Telegram, and future interfaces are channels.
They are not the business logic itself.

**Principle:** channel surfaces can evolve, but the operating system beneath them should remain coherent and portable.

## 12. Every meaningful interaction should lead to a controlled outcome

MMD is not built to capture clicks. It is built to control outcomes.

Payments should verify cleanly. Sessions should progress predictably. Characters should guide without breaking system truth. Admin actions should be auditable.

**Principle:** the platform should be judged by whether it creates controlled outcomes, not by whether it merely exposes functionality.

## Design doctrine summary

MMD is built on the following doctrine:

- System over improvisation
- Flow over isolated features
- State over ambiguity
- Boundaries over overlap
- Migration around the core, not through it
- Character at the surface, control underneath
- Premium experience through invisible precision

## One-line definition

**MMD is an operating system with personality, built to turn human-driven operations into controlled, scalable, and premium experience.**
