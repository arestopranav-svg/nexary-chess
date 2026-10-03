import type { GhostTracePoint } from '../../shared/events.ts';
import type { Square } from '../../shared/types.ts';

export interface AnimationPayloads {
  move: { from: Square; to: Square; san: string };
  capture: { square: Square };
  check: { kingSquare: Square | null };
  'ghost-trace': GhostTracePoint;
}
export type AnimationId = keyof AnimationPayloads;

export interface AnimationBackend {
  play<K extends AnimationId>(id: K, data: AnimationPayloads[K]): void;
}

let backend: AnimationBackend | null = null;

/** AI-2: install the real renderer here. Data shapes are typed; no `any`. */
export function registerAnimationBackend(b: AnimationBackend | null): void { backend = b; }

export function playAnimation<K extends AnimationId>(id: K, data: AnimationPayloads[K]): void {
  backend?.play(id, data);
}
