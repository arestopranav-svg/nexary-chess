import { Chess } from 'chess.js';
import type { AppliedMove, Color, GameResult, MoveType, PieceType, PromotionPiece, Termination } from '../../shared/types.ts';

/**
 * Thin adapter over chess.js (the single source of truth for legality).
 * It never decides rules itself; it only normalises chess.js output into AppliedMove
 * and maps game-over flags to result/termination.
 */
export type Outcome =
  | { over: false }
  | { over: true; result: Exclude<GameResult, '*'>; termination: Termination };

export interface MoveInput { from: string; to: string; promotion?: string }
export interface MoveContext { clockLeftMs: number; timestamp: number }

const SQUARE = /^[a-h][1-8]$/;
const PROMO = new Set(['q', 'r', 'b', 'n']);

function moveTypeFromFlags(flags: string): MoveType {
  if (flags.includes('k')) return 'kingside-castle';
  if (flags.includes('q')) return 'queenside-castle';
  if (flags.includes('e')) return 'en-passant';
  if (flags.includes('p')) return flags.includes('c') ? 'promotion-capture' : 'promotion';
  if (flags.includes('c')) return 'capture';
  return 'normal';
}

export class ChessJsRules {
  #chess: Chess;
  #ply: number;

  constructor(fen?: string) {
    this.#chess = fen ? new Chess(fen) : new Chess(); // throws on an invalid FEN
    const parts = this.#chess.fen().split(' ');
    this.#ply = (Number(parts[5]) - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
  }

  fen(): string { return this.#chess.fen(); }
  pgn(): string { return this.#chess.pgn(); }
  turn(): Color { return this.#chess.turn() === 'w' ? 'white' : 'black'; }

  /** Returns null for ANY illegal or malformed move; the caller emits ILLEGAL_MOVE. */
  tryMove(input: MoveInput, ctx: MoveContext): AppliedMove | null {
    if (!SQUARE.test(input.from) || !SQUARE.test(input.to)) return null;
    if (input.promotion !== undefined && !PROMO.has(input.promotion)) return null;
    const fenBefore = this.#chess.fen();
    let m;
    try {
      m = this.#chess.move({ from: input.from, to: input.to, promotion: input.promotion });
    } catch {
      return null;
    }
    this.#ply += 1;
    const moveType = moveTypeFromFlags(m.flags);
    const captured = (m.captured ?? null) as PieceType | null;
    return {
      ply: this.#ply,
      moveNumber: Number(fenBefore.split(' ')[5]),
      color: m.color === 'w' ? 'white' : 'black',
      piece: m.piece as PieceType,
      from: m.from, to: m.to, san: m.san,
      captured,
      captureSquare: moveType === 'en-passant' ? `${m.to[0]}${m.from[1]}` : captured ? m.to : null,
      promotion: (m.promotion ?? null) as PromotionPiece | null,
      moveType,
      fenBefore, fenAfter: this.#chess.fen(),
      isCheck: this.#chess.isCheck(),
      isCheckmate: this.#chess.isCheckmate(),
      isStalemate: this.#chess.isStalemate(),
      clockLeftMs: ctx.clockLeftMs,
      timestamp: ctx.timestamp,
    };
  }

  outcome(): Outcome {
    const c = this.#chess;
    if (c.isCheckmate()) {
      // The side to move is mated, so the other side won.
      return { over: true, result: c.turn() === 'b' ? '1-0' : '0-1', termination: 'CHECKMATE' };
    }
    if (c.isStalemate()) return { over: true, result: '1/2-1/2', termination: 'STALEMATE' };
    if (c.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', termination: 'INSUFFICIENT' };
    if (c.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', termination: 'REPETITION' };
    if (c.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', termination: 'FIFTY_MOVE' };
    return { over: false };
  }
}
