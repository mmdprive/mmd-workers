# Architecture Docs

This folder documents the current MMD system architecture.

## Files

- [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md)
  High-level summary of the MMD platform, architectural layers, and current system definition.

- [`WORKERS.md`](./WORKERS.md)
  Canonical worker list, responsibilities, and layer separation.

- [`INTERNAL_DOCTRINE.md`](./INTERNAL_DOCTRINE.md)
  Internal principles, hard truths, and system philosophy used to guide implementation and decision-making.

## Current layer map

### Experience Layer
- `chat-worker`
- TMIB character interface

### Core Production Layer
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

### Real-time Layer
- `realtime-worker`

### Migration Layer
- `immigrate-worker`

### Operator Layer
- `Admin Console V1`

## Reading order

1. Start with `SYSTEM_OVERVIEW.md`
2. Continue to `WORKERS.md`
3. Use `INTERNAL_DOCTRINE.md` for principles and constraints
