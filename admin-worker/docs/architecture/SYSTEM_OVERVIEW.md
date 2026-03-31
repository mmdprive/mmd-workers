# System Overview

## Definition

MMD is a channel-agnostic operating system with personality.

It is designed to coordinate controlled human experience across service, membership, real-time interaction, operator workflows, and character-driven interface.

## Core principle

**System at the core. Character at the surface. Experience as the output.**

## Architectural layers

### 1. Experience Layer
This is the user-facing surface of MMD.

Components:
- `chat-worker`
- TMIB character interface
- Web / LINE / Telegram / future channels

This layer is how users enter the system.

### 2. Core Production Layer
This is the control engine of the platform.

Components:
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

This layer controls money, membership authority, state transitions, automation, and internal system communication.

### 3. Real-time Layer
This layer handles live interaction and time-sensitive coordination.

Components:
- `realtime-worker`

This layer supports real-time rooms, session coordination, and live interaction behavior.

### 4. Migration Layer
This layer is responsible for moving legacy data and workflows into the main system.

Components:
- `immigrate-worker`

This layer must stay distinct from core production contracts.

### 5. Operator Layer
This layer is the human-facing control surface for the platform.

Components:
- `Admin Console V1`

This is where operators and admins manage the system.

## Character interface model

MMD does not expose itself as a neutral utility. It expresses itself through characters.

TMIB characters currently used as the interface layer:
- Hito
- Hiro
- Hima
- Hiei
- Kenji
- Tart

This means users do not simply interact with a generic assistant. They enter the system through a character-led experience.

## Production truths

- `session_id` is the primary reference for session and idempotency logic
- token parameter must be `t`
- Airtable is the operational source of truth for back-office flows
- Memberstack is used as the public auth and membership layer
- `telegram-worker` remains internal only
- migration concerns must not be mixed into core production contracts

## High-level map

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
