# STATE MACHINE

## Purpose

This document defines the canonical session state machine of MMD.

It explains how a session moves from confirmation to payout, what each state means, and which layers of the system are allowed to influence that movement.

The state machine exists to make live service behavior predictable, auditable, and controlled.

## Core principle

A session should not move because people improvise.
A session should move because the system recognizes a valid operational moment.

## Canonical session flow

```txt
confirmed
→ reminder
→ en_route
→ arrived
→ met
→ final_payment_pending
→ work_started
→ work_finished
→ separated
→ review
→ payout
```

This is the primary production flow for controlled MMD session handling.

## State definitions

### `confirmed`
The session has been accepted into the system and is considered a real operational object.

Meaning:
- session exists as valid production work
- core identifiers and references should already exist
- follow-up automation may begin from here

Typical triggers:
- booking/session creation completed
- confirmation conditions satisfied

### `reminder`
The system is preparing the upcoming session and sending pre-session guidance.

Meaning:
- the session is approaching execution time
- reminder messages and expectation-setting may be sent
- this is still a pre-movement state

Typical triggers:
- scheduled reminder window reached
- pre-job automation runs

### `en_route`
The model is in transit toward the job location.

Meaning:
- physical movement has started
- ETA and delay-sensitive coordination become important
- real-time support may become relevant here

Typical triggers:
- model indicates departure
- dispatch/movement event enters active route phase

### `arrived`
The model has reached the destination area or meeting area.

Meaning:
- transit phase is complete
- arrival confirmation logic becomes active
- the system is now close to handoff / meeting behavior

Typical triggers:
- arrival acknowledgment
- location/proximity confirmation
- operator-supported arrival confirmation

### `met`
The customer and model have successfully met or connected at the operational handoff point.

Meaning:
- the session has moved from travel logistics into on-site interaction
- final pre-work checks become important

Typical triggers:
- meeting confirmation
- customer/model mutual acknowledgment
- operator/system confirmation of successful contact

### `final_payment_pending`
The session is waiting for final payment clearance before work may begin.

Meaning:
- parties have met
- work has not yet begun
- financial gate is active

Typical triggers:
- post-meeting payment requirement
- system rule requiring final payment confirmation before work start

Important:
- this is a hard control state
- it prevents the session from becoming work_started too early

### `work_started`
The actual service/work period has begun.

Meaning:
- the delivery phase is now active
- time-sensitive or session-sensitive tracking may continue
- downstream completion flow becomes available

Typical triggers:
- final payment has been confirmed where required
- work start acknowledged by allowed actors

Important:
- this state should not open unless required payment gates are satisfied

### `work_finished`
The active service/work has ended.

Meaning:
- the core delivery phase is complete
- post-work closure logic now begins

Typical triggers:
- work end acknowledgment
- completion action from valid actor/system path

### `separated`
The customer and model are no longer in the same active session context.

Meaning:
- physical or operational separation has happened
- post-session review and payout flow can safely proceed

Typical triggers:
- separation acknowledgment
- session closure event after finish

### `review`
The system is collecting or processing post-session review signals.

Meaning:
- evaluation and feedback stage is active
- customer/model follow-up can be initiated

Typical triggers:
- review request dispatch
- post-session follow-up sequence

### `payout`
The session has entered payout handling or payout completion flow.

Meaning:
- service lifecycle is operationally complete
- compensation flow is now active or finalized

Typical triggers:
- successful completion of prior states
- payout release path

## State transition rules

### Transitions should be directional
The session should move forward through meaningful operational states.

Reverse movement should be rare and treated as an exception, not a normal feature.

### States are not decorative labels
Each state must correspond to a real business or operational condition.

If a state does not change behavior, notification, visibility, gating, or allowed actions, it should not exist.

### Not every actor owns every transition
Different workers or surfaces may observe a state, but not all of them should be able to advance it.

## Worker relationship to the state machine

### `events-worker`
Primary automation and timeline engine.

This is the main worker responsible for orchestrating state progression logic across reminders, movement, arrival, work lifecycle, review, and payout.

### `payments-worker`
Financial gate authority.

This worker influences whether payment-dependent transitions are allowed, especially around:
- `final_payment_pending`
- `work_started`

### `realtime-worker`
Live coordination support.

This worker does not own the business state machine, but it supports sensitive live moments around:
- `en_route`
- `arrived`
- `met`
- `final_payment_pending`

### `telegram-worker`
Internal notification surface.

It should reflect state changes for internal visibility, not define them.

### `admin-worker`
Administrative authority.

It may support exceptional control, operator workflows, or authority-driven correction, but normal state progression should still remain system-led.

### `chat-worker`
Character-facing interaction layer.

It may express the current stage to users through TMIB character experience, but it should not become the uncontrolled source of truth for state changes.

## Payment gate logic

The most important hard gate in the current flow is:

```txt
met
→ final_payment_pending
→ work_started
```

Meaning:
- meeting alone does not mean work has started
- final payment may be required before work begins
- `work_started` must not unlock early just because the session is physically live

This protects operational control and payment truth.

## Real-time moments

The most live-sensitive states are usually:
- `en_route`
- `arrived`
- `met`
- `final_payment_pending`

These are the moments where uncertainty increases and real-time coordination becomes most useful.

The role of real-time is to reduce ambiguity during these transitions, not replace the state machine itself.

## Operator and exception handling

The operator layer may need visibility or controlled override paths in exceptional cases such as:
- failed acknowledgment
- delay or mismatch in live status
- payment proof disputes
- manual recovery of stuck sessions

Even in those cases, state correction should be explicit and traceable.

The system should prefer controlled exception handling over silent manual drift.

## Design rules

### 1. State names must map to behavior
A state should change what the system does, shows, or allows.

### 2. Gates must be explicit
If payment or confirmation is required, that gate should be visible in the state logic.

### 3. Real-time supports the flow
Real-time should help the system understand a moment, but should not become the canonical business truth by itself.

### 4. Characters express the state, not define it
TMIB characters may communicate a stage beautifully, but the business state still belongs to the production system.

### 5. Exceptions must not redefine the normal path
Manual intervention is a recovery path, not the main architecture.

## Recommended mental model

Think of the state machine as the timeline spine of MMD.

- `events-worker` moves the timeline
- `payments-worker` protects the money gate
- `realtime-worker` supports live moments
- `telegram-worker` reflects internal visibility
- `chat-worker` expresses the journey through character
- `admin-worker` handles authority and controlled exception paths

## One-line definition

The MMD state machine is the canonical session timeline that turns live service into controlled, auditable, system-driven progression.
