# Architecture

This directory contains the current architectural documents for MMD.

MMD is a channel-agnostic operating system with personality.

It separates interface, business control, real-time coordination, migration, and operator control into distinct layers so the system can scale without collapsing into channel-specific or human-driven chaos.

## Core principle

**System at the core. Character at the surface. Experience as the output.**

## Documents in this directory

- [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md) — high-level system definition and layer map
- [`WORKERS.md`](./WORKERS.md) — current worker roles and layer boundaries
- [`REALTIME.md`](./REALTIME.md) — role of `realtime-worker` in live coordination
- [`CHARACTERS.md`](./CHARACTERS.md) — TMIB character interface as architecture
- [`LAYERS.md`](./LAYERS.md) — layered model of MMD
- [`PRINCIPLES.md`](./PRINCIPLES.md) — platform principles and operating rules
- [`INTERNAL_DOCTRINE.md`](./INTERNAL_DOCTRINE.md) — internal control doctrine for the system

## Corrected architectural map

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

## Official summary

MMD is a channel-agnostic operating system with personality — expressed through TMIB characters, powered by core production workers, extended by a real-time layer, supported by a migration layer, and operated through Admin Console V1.
