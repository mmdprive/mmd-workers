# REALTIME

## Purpose

`realtime-worker` is the live interaction layer of MMD.

It exists to support moments that cannot be handled well by delayed automation alone — including live chat, live location, room-based coordination, and session-time interaction between customer, model, and system.

This layer sits between the controlled automation system and real-world interaction.

## Position in the architecture

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
```

`realtime-worker` is not the main business authority.
It does not replace `events-worker`, `payments-worker`, or `admin-worker`.

Its role is to provide a live channel when the system needs synchronized activity in the moment.

## Core responsibilities

### 1. Open live rooms
`realtime-worker` creates room-based live sessions tied to operational context such as a job, session, or participant pair.

### 2. Issue room access tokens
It provides access tokens or live links so the correct participants can join the correct room with controlled scope.

### 3. Support WebSocket communication
It powers real-time transport for event types such as:
- chat
- location
- status ping / keepalive
- lightweight media metadata

### 4. Maintain live session context
It can store current room state such as:
- last known location
- room membership
- latest real-time events
- active room status

### 5. Bridge automation with live interaction
It allows the platform to move from scheduled or triggered automation into live operational coordination.

## What `realtime-worker` is not

It is not:
- the payment authority
- the membership authority
- the main automation engine
- the operator console
- the TMIB personality layer

Those remain elsewhere:
- `payments-worker` = money truth
- `admin-worker` = authority / access / admin orchestration
- `events-worker` = automation timeline
- `chat-worker` = character-facing interface
- `Admin Console V1` = operator surface

## Real-time use cases in MMD

### Live location during jobs
A model may need to share movement updates or location context during the route to a job.

### Live room coordination
Customer and model may join the same live room with scoped access while the system tracks the session.

### Status continuity
The system may need a real-time channel to reduce ambiguity during sensitive states such as:
- en_route
- arrived
- met
- final payment pending

### Future expansion
This layer can support additional live experiences later without changing the core role of other workers.

Examples may include:
- richer customer-model coordination
- internal supervisor live monitoring
- media-assisted check-in or proof flows
- call provider token issuing via compatible integrations

## Design rules

### Keep the role narrow
`realtime-worker` should remain focused on live transport and room state.
It should not absorb business authority from other workers.

### Respect worker boundaries
- payment decisions stay in `payments-worker`
- membership decisions stay in `admin-worker`
- automation state transitions stay in `events-worker`

### Treat live state as supporting state
Real-time data helps the platform coordinate live moments, but canonical business truth should still map back to the main production system.

## MMD principle

Real-time exists to reduce chaos, not create it.

The goal is not to make the system feel busy.
The goal is to make live moments feel controlled.

## One-line definition

`realtime-worker` is the real-time session layer of MMD — responsible for live rooms, scoped access, and in-the-moment coordination between participants and system.
