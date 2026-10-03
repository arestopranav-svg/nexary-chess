# NEXARY — Phase 0 Audit Report

**Status: the audit could not be performed against an existing project.** No codebase was available in this session
(the uploads directory was empty and there is no repository access). Nothing below describes an existing NEXARY app;
it describes what this session built from scratch and how far it was verified.

## Environment limits (affect what could be verified)
- No network: `npm install` fails (registry returns 403), so no framework, `chess.js`, Socket.IO, ESLint or bundler could be installed.
- Available: Node 22.22, TypeScript 6.0.3 (global), `node:test`. No Postgres, no python-chess.
- Consequence: `npm run build`, lint, a running server, browser/mobile checks and the manual chess checklist were **not run**.

## 1. Stack detection / 2. File map
Not applicable — no existing project. **Action:** run Phase 0 inside the real repo (framework, auth, DB, realtime, routes, env vars) before integrating anything here.

## 3. Reuse decision
Everything added is framework-independent TypeScript with no imports from any app framework, so it can be dropped into an
existing project without replacing working auth, DB or realtime. Keep existing infrastructure; adopt these modules where they fill gaps.

## 4. Gap analysis against the spec
| Area | State |
|---|---|
| Clock engine (increment, flag-on-receive, pause/resume, 100ms tick / 200ms timeout loop) | **Built and tested** (clock.test.ts) |
| Time-control presets + bullet/blitz/rapid classification | **Built and tested** |
| Glicko-2 (per time class), provisional < 10 games | **Built and tested** (matches Glickman's worked example) |
| Event model, event bus, move-to-event derivation incl. Ghost Trace data | **Built and tested** |
| Disconnect/abort policy, per-socket rate limiter, signed recovery tokens | **Built and tested** |
| Audio + animation interfaces (typed, swappable backends) | **Built**, type-checked only |
| chess.js rules adapter (castling, en passant, promotion, draws, mate) | **Written, NOT executed** (needs `npm install`; tests in test/rules.test.ts) |
| Postgres schema + indexes | **Written, NOT executed** against a database |
| Design tokens (styles/tokens.css) | **Written** |
| Socket.IO server, game service, matchmaking, rematch, draw offers, resign | Not started |
| Auth, profile API, REST endpoints | Not started |
| UI components, responsive layout, accessibility | Not started |
| Stockfish worker, `ai/` folder, PGN import/export | Not started |
| Build, lint, manual test checklist | Not run |

## 5. Decisions and risks to review
- **WebSockets need a long-lived Node process.** If the app deploys to serverless (e.g. Next.js on Vercel), run Socket.IO as a separate service with the Redis adapter.
- **Clock time source:** `Date.now()` as specified; a wall-clock step backwards is clamped (never credits time). A monotonic source would be stricter if clocks are not persisted across restarts.
- **Ratings:** Glicko-2 is applied per game; the paper assumes rating periods. Fine for launch; revisit for leaderboards.
- **Termination values:** `ABORTED` and `ABANDONED` were added to the spec's list to cover the 60s-abort and 90s-forfeit rules.
- **Increment:** applied after every legal move, including the first.
- **Client time is never used.** Move receive time on the server decides flagging, so a move arriving after expiry loses on time.
