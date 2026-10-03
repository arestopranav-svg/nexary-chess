# NEXARY — Handoff to AI-2 (PARTIAL: foundation modules only)

The realtime server, UI components, auth and analysis worker **do not exist yet**. This document covers what does,
plus the contract the remaining pieces are meant to follow. Items marked *(contract)* are design, not implemented code.

## Architecture (text)
    UI / audio / animation (AI-2)  --subscribes-->  GameEventBus  <--emits--  game service (to build)
                                                                                   |
        chess.js adapter (rules.ts)  +  clock engine (pure)  +  Glicko-2  +  policy/rate-limit/tokens
                                                                                   |
                                                                              Postgres (db/schema.sql)

## Stack (as actually present)
TypeScript (strict, erasable syntax), Node >= 22.6, `node:test`, `chess.js` ^1 (declared, not yet installed/run). No UI framework chosen yet.

## Important files
- `src/shared/types.ts` — GameState, AppliedMove, ClockState, enums
- `src/shared/events.ts` — GameEvent union, GhostTracePoint, GameEventBus
- `src/server/game/moveEvents.ts` — AppliedMove -> ordered events
- `src/server/game/rules.ts` — chess.js adapter (unexecuted)
- `src/server/clock/clockEngine.ts`, `clockLoop.ts` — authoritative clocks
- `src/server/rating/glicko2.ts` — rating math
- `src/server/security/{policy,rateLimiter,recoveryToken}.ts`
- `src/lib/audio/audioEvents.ts`, `src/lib/animation/animationEvents.ts` — AI-2 plug-in points
- `styles/tokens.css`, `db/schema.sql`

## Events (subscribe, never edit game logic)
`GAME_START, MOVE, CAPTURE, CHECK, CHECKMATE, STALEMATE, DRAW, CASTLE, PROMOTION, ILLEGAL_MOVE, RESIGNATION, TIMEOUT,
CLOCK_WARNING, PLAYER_CONNECTED, PLAYER_DISCONNECTED, PLAYER_RECONNECTING, GAME_END`.
Per move the order is `MOVE`, then `CAPTURE` / `CASTLE` / `PROMOTION`, then `CHECK` (or `CHECKMATE` / `STALEMATE`).
`CAPTURE.square` is the captured pawn's square for en passant.

**Ghost Trace:** every `MOVE` carries `payload.trace = { previousSquare, currentSquare, capturedPiece, moveType, timestamp, player, moveNumber }`.

## Audio / animation interfaces
    registerAudioBackend({ play(id) { ... } })            // SoundId: move capture check checkmate promotion castle illegal clock-warning win loss draw
    registerAnimationBackend({ play(id, data) { ... } })  // ids: move capture check ghost-trace; data is typed per id
Call sites use `playSound(id)` / `playAnimation(id, data)` and never change. Which event maps to which sound is AI-2's decision (not implemented).

## Design tokens
Defined in `styles/tokens.css`: surfaces/text, accent-cyan, success/warning/danger, board (light/dark/highlights/legal-dot), pieces,
radius, shadow-premium, spacing scale, typography, `--ease-luxury`, durations (zeroed under `prefers-reduced-motion`), `--touch-target-min: 44px`.
Components must reference variables only. Current values are neutral placeholders.

## WebSocket contract *(contract, not implemented)*
Client -> server: `game:create, game:join, game:move {from,to,promotion?}, game:resign, game:draw_offer, game:draw_accept, game:draw_decline, game:rematch, game:recover {token}, queue:join, queue:leave`.
Server -> client: `game:state_update (GameState), clock:tick (ClockSnapshot), game:event (GameEvent), game:recovery {token, expiresAt}, game:error {code}`.
Player identity always comes from the authenticated session, never the payload.

## Clock behavior
Server-only. Remaining time = stored − (now − lastTick) for the active side; increment added after each legal move; a move received after expiry loses on time.
Disconnect: clock paused 15s, then runs; forfeit at 90s. Abort if nobody moves within 60s. Recovery token valid 2 min. Max 20 moves/s per socket.

## Known limitations / TODO
Everything under "Not started" in AUDIT_REPORT.md. The chess.js adapter, SQL schema and token CSS have not been executed or rendered.

## Run locally
    npm install
    npm run type-check
    npm test        # includes test/rules.test.ts, which needs chess.js
