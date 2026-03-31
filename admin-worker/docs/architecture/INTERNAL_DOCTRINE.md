# Internal Doctrine

This document defines the internal doctrine of the MMD platform.

It is not a marketing document. It is a control document.

## 1. What MMD is

MMD is a channel-agnostic operating system with personality.

It is built to replace human improvisation with controlled system behavior.

## 2. Core philosophy

**System at the core. Character at the surface. Experience as the output.**

This means:
- infrastructure is the truth
- character is the interface
- experience is designed, not accidental

## 3. What the system must never become

MMD must not degrade into:
- a loose collection of bots
- channel-specific chaos
- manual operations disguised as software
- UI-first decisions that break architectural truth

## 4. Operational truths

The following truths are treated as structural:

- `session_id` is the primary operational reference
- `t` is the canonical token parameter
- Airtable is the back-office truth layer
- Memberstack is the public-facing auth and membership layer
- worker boundaries are part of the production contract
- migration stays separate from core production

## 5. Character doctrine

MMD does not speak in one neutral voice.

It presents itself through TMIB characters:
- Hito
- Hiro
- Hima
- Hiei
- Kenji
- Tart

Character is not decoration.
Character is the interface layer of the system.

## 6. Layer doctrine

### Experience Layer
Where the user feels the system.

### Core Production Layer
Where the business truth is controlled.

### Real-time Layer
Where live interaction is coordinated.

### Migration Layer
Where legacy is moved without corrupting core truth.

### Operator Layer
Where humans supervise and operate the system.

## 7. Boundary doctrine

A worker boundary is not a preference.
It is part of the system contract.

If boundaries collapse:
- truth becomes ambiguous
- ownership becomes unclear
- behavior becomes chaotic

## 8. Final statement

MMD is not just software.

It is a controlled operating system for human experience — expressed through character, enforced through architecture, and maintained through discipline.
