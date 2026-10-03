import type { ClockState, Color } from '../../shared/types.ts';
import { flaggedColor, liveRemaining } from './clockEngine.ts';

export interface ClockSnapshot {
  white: number;
  black: number;
  active: Color | null;
  serverTime: number; // clients interpolate from this; server time always wins
}

export interface ClockLoopOptions {
  getClock: () => ClockState;
  onTick: (snap: ClockSnapshot) => void;
  onTimeout: (loser: Color) => void;
  now?: () => number;
  tickMs?: number;   // broadcast cadence (default 100)
  checkMs?: number;  // authoritative timeout check cadence (default 200)
}

export interface ClockLoop { start(): void; stop(): void }

export function createClockLoop(o: ClockLoopOptions): ClockLoop {
  const now = o.now ?? Date.now;
  let tick: ReturnType<typeof setInterval> | undefined;
  let check: ReturnType<typeof setInterval> | undefined;
  return {
    start() {
      if (tick || check) return;
      tick = setInterval(() => {
        const c = o.getClock(); const t = now();
        o.onTick({ white: liveRemaining(c, 'white', t), black: liveRemaining(c, 'black', t), active: c.active, serverTime: t });
      }, o.tickMs ?? 100);
      check = setInterval(() => {
        const loser = flaggedColor(o.getClock(), now());
        if (loser) o.onTimeout(loser); // caller must stop the clock; the loop does not mutate state
      }, o.checkMs ?? 200);
    },
    stop() {
      if (tick) clearInterval(tick);
      if (check) clearInterval(check);
      tick = check = undefined;
    },
  };
}
