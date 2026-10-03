import type { ClockState, Color, TimeClass } from '../../shared/types.ts';

/**
 * Pure, immutable clock core. No timers in here: remaining time is always derived
 * from (state, now), so there is no accumulated interval drift by construction.
 * Timers (clockLoop.ts) only decide WHEN to look, never HOW MUCH time passed.
 */

export function createClock(baseMs: number, incrementMs: number): ClockState {
  if (!(baseMs > 0) || incrementMs < 0) throw new RangeError('invalid time control');
  return { white: baseMs, black: baseMs, increment: incrementMs, lastTick: 0, active: null };
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

export function liveRemaining(c: ClockState, color: Color, now: number): number {
  const stored = c[color];
  if (c.active !== color) return stored;
  // Guard against a wall-clock step backwards: never credit negative elapsed time.
  const elapsed = Math.max(0, now - c.lastTick);
  return Math.max(0, stored - elapsed);
}

export function startClock(c: ClockState, color: Color, now: number): ClockState {
  return { ...c, active: color, lastTick: now };
}

/** Freeze the running clock, charging elapsed time to the active side. */
export function pauseClock(c: ClockState, now: number): ClockState {
  if (c.active === null) return c;
  return { ...c, [c.active]: liveRemaining(c, c.active, now), active: null, lastTick: now };
}

export function resumeClock(c: ClockState, color: Color, now: number): ClockState {
  return c.active === null ? { ...c, active: color, lastTick: now } : c;
}

export type MoveClockResult =
  | { ok: true; clock: ClockState; remaining: number }
  | { ok: false; reason: 'NOT_ACTIVE' }
  | { ok: false; reason: 'FLAGGED'; flagged: Color; clock: ClockState };

/** Called when the server RECEIVES a move. Server receive time is the only time that counts. */
export function applyMoveToClock(c: ClockState, mover: Color, now: number): MoveClockResult {
  if (c.active !== mover) return { ok: false, reason: 'NOT_ACTIVE' };
  const left = c[mover] - Math.max(0, now - c.lastTick);
  if (left <= 0) {
    return { ok: false, reason: 'FLAGGED', flagged: mover, clock: { ...c, [mover]: 0, active: null, lastTick: now } };
  }
  const remaining = left + c.increment;
  return {
    ok: true,
    remaining,
    clock: { ...c, [mover]: remaining, active: other(mover), lastTick: now },
  };
}

/** Authoritative timeout test, run by the 200ms check loop. */
export function flaggedColor(c: ClockState, now: number): Color | null {
  return c.active !== null && liveRemaining(c, c.active, now) <= 0 ? c.active : null;
}

/** Rating class from estimated duration (base + 40 * increment), the common convention. */
export function classifyTimeControl(baseMs: number, incrementMs: number): TimeClass {
  const estSeconds = baseMs / 1000 + 40 * (incrementMs / 1000);
  if (estSeconds < 180) return 'bullet';
  if (estSeconds < 480) return 'blitz';
  return 'rapid';
}

export const PRESET_TIME_CONTROLS: ReadonlyArray<{ id: string; baseMs: number; incrementMs: number }> = [
  { id: '1+0', baseMs: 60_000, incrementMs: 0 },
  { id: '2+1', baseMs: 120_000, incrementMs: 1000 },
  { id: '3+0', baseMs: 180_000, incrementMs: 0 },
  { id: '3+2', baseMs: 180_000, incrementMs: 2000 },
  { id: '5+0', baseMs: 300_000, incrementMs: 0 },
  { id: '10+0', baseMs: 600_000, incrementMs: 0 },
  { id: '10+5', baseMs: 600_000, incrementMs: 5000 },
  { id: '15+10', baseMs: 900_000, incrementMs: 10_000 },
];
