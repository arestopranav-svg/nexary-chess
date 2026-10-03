import type { AppliedMove, Color, Square } from '../../shared/types.ts';
import type { GameEvent, GhostTracePoint } from '../../shared/events.ts';

const CASTLE_ROOKS: Record<string, { rookFrom: Square; rookTo: Square; side: 'kingside' | 'queenside' }> = {
  e1g1: { rookFrom: 'h1', rookTo: 'f1', side: 'kingside' },
  e1c1: { rookFrom: 'a1', rookTo: 'd1', side: 'queenside' },
  e8g8: { rookFrom: 'h8', rookTo: 'f8', side: 'kingside' },
  e8c8: { rookFrom: 'a8', rookTo: 'd8', side: 'queenside' },
};

export function toGhostTracePoint(m: AppliedMove): GhostTracePoint {
  return {
    previousSquare: m.from, currentSquare: m.to, capturedPiece: m.captured,
    moveType: m.moveType, timestamp: m.timestamp, player: m.color, moveNumber: m.moveNumber,
  };
}

/** Square of the king that is in check after `m` (the side that just did NOT move). Needs FEN scan. */
function kingSquareAfter(fenAfter: string, inCheck: Color): Square | null {
  const rows = (fenAfter.split(' ')[0] ?? '').split('/');
  const target = inCheck === 'white' ? 'K' : 'k';
  for (let r = 0; r < rows.length; r++) {
    let file = 0;
    for (const ch of rows[r] ?? '') {
      if (/\d/.test(ch)) { file += Number(ch); continue; }
      if (ch === target) return `${'abcdefgh'[file]}${8 - r}`;
      file++;
    }
  }
  return null;
}

/**
 * Pure derivation of the per-move event sequence:
 * MOVE, then CAPTURE / CASTLE / PROMOTION, then CHECK (or CHECKMATE / STALEMATE).
 * Terminal GAME_END / RESIGNATION / TIMEOUT / DRAW come from the game service, not from here.
 */
export function deriveMoveEvents(gameId: string, m: AppliedMove): GameEvent[] {
  const at = m.timestamp;
  const opp: Color = m.color === 'white' ? 'black' : 'white';
  const out: GameEvent[] = [
    { type: 'MOVE', gameId, at, payload: {
      color: m.color, from: m.from, to: m.to, san: m.san, fen: m.fenAfter,
      isCapture: m.captured !== null, isCheck: m.isCheck, moveType: m.moveType, trace: toGhostTracePoint(m),
    } },
  ];
  if (m.captured && m.captureSquare) {
    out.push({ type: 'CAPTURE', gameId, at, payload: { capturedPiece: m.captured, square: m.captureSquare, by: m.color } });
  }
  if (m.moveType === 'kingside-castle' || m.moveType === 'queenside-castle') {
    const rook = CASTLE_ROOKS[`${m.from}${m.to}`];
    if (rook) out.push({ type: 'CASTLE', gameId, at, payload: { color: m.color, side: rook.side, kingFrom: m.from, kingTo: m.to, rookFrom: rook.rookFrom, rookTo: rook.rookTo } });
  }
  if (m.promotion) {
    out.push({ type: 'PROMOTION', gameId, at, payload: { color: m.color, from: m.from, to: m.to, newPiece: m.promotion } });
  }
  if (m.isCheckmate) {
    out.push({ type: 'CHECKMATE', gameId, at, payload: { winner: m.color } });
  } else if (m.isCheck) {
    out.push({ type: 'CHECK', gameId, at, payload: { color: opp, kingSquare: kingSquareAfter(m.fenAfter, opp) } });
  } else if (m.isStalemate) {
    out.push({ type: 'STALEMATE', gameId, at, payload: {} });
  }
  return out;
}
