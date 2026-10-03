import type { Color, GameResult, MoveType, PieceType, PromotionPiece, Square, Termination } from './types.ts';

/** Everything AI-2's animation/audio layer needs for Ghost Trace, in one flat object. */
export interface GhostTracePoint {
  previousSquare: Square;
  currentSquare: Square;
  capturedPiece: PieceType | null;
  moveType: MoveType;
  timestamp: number;
  player: Color;
  moveNumber: number;
}

interface Base { gameId: string; at: number }

export type GameEvent =
  | (Base & { type: 'GAME_START'; payload: { whiteId: string; blackId: string } })
  | (Base & { type: 'MOVE'; payload: { color: Color; from: Square; to: Square; san: string; fen: string; isCapture: boolean; isCheck: boolean; moveType: MoveType; trace: GhostTracePoint } })
  | (Base & { type: 'CAPTURE'; payload: { capturedPiece: PieceType; square: Square; by: Color } })
  | (Base & { type: 'CHECK'; payload: { kingSquare: Square | null; color: Color } })
  | (Base & { type: 'CHECKMATE'; payload: { winner: Color } })
  | (Base & { type: 'STALEMATE'; payload: Record<string, never> })
  | (Base & { type: 'DRAW'; payload: { reason: Termination } })
  | (Base & { type: 'CASTLE'; payload: { color: Color; side: 'kingside' | 'queenside'; kingFrom: Square; kingTo: Square; rookFrom: Square; rookTo: Square } })
  | (Base & { type: 'PROMOTION'; payload: { color: Color; from: Square; to: Square; newPiece: PromotionPiece } })
  | (Base & { type: 'ILLEGAL_MOVE'; payload: { from: Square; to: Square; reason: string } })
  | (Base & { type: 'RESIGNATION'; payload: { resigned: Color } })
  | (Base & { type: 'TIMEOUT'; payload: { loser: Color } })
  | (Base & { type: 'CLOCK_WARNING'; payload: { color: Color; timeLeftMs: number } })
  | (Base & { type: 'PLAYER_CONNECTED'; payload: { color: Color } })
  | (Base & { type: 'PLAYER_DISCONNECTED'; payload: { color: Color } })
  | (Base & { type: 'PLAYER_RECONNECTING'; payload: { color: Color } })
  | (Base & { type: 'GAME_END'; payload: { result: Exclude<GameResult, '*'>; termination: Termination } });

export type GameEventType = GameEvent['type'];
export type EventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;
export type Unsubscribe = () => void;

/**
 * Central, dependency-free event bus. Game logic emits; UI/audio/animation subscribe.
 * A throwing subscriber must never be able to break game logic or other subscribers.
 */
export class GameEventBus {
  #all = new Set<(e: GameEvent) => void>();
  #byType = new Map<GameEventType, Set<(e: never) => void>>();
  #onError: (err: unknown, e: GameEvent) => void;

  constructor(onError: (err: unknown, e: GameEvent) => void = () => {}) {
    this.#onError = onError;
  }

  subscribe(listener: (e: GameEvent) => void): Unsubscribe {
    this.#all.add(listener);
    return () => { this.#all.delete(listener); };
  }

  on<T extends GameEventType>(type: T, handler: (e: EventOf<T>) => void): Unsubscribe {
    let set = this.#byType.get(type);
    if (!set) { set = new Set(); this.#byType.set(type, set); }
    set.add(handler as (e: never) => void);
    return () => { set.delete(handler as (e: never) => void); };
  }

  emit(e: GameEvent): void {
    for (const l of [...this.#all]) this.#safe(() => l(e), e);
    const typed = this.#byType.get(e.type);
    if (typed) for (const h of [...typed]) this.#safe(() => (h as (ev: GameEvent) => void)(e), e);
  }

  #safe(fn: () => void, e: GameEvent): void {
    try { fn(); } catch (err) { this.#onError(err, e); }
  }
}
