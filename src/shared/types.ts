export type Color = 'white' | 'black';
export type Square = string; // algebraic, e.g. "e4"
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type Termination =
  | 'CHECKMATE' | 'RESIGNATION' | 'TIMEOUT' | 'STALEMATE' | 'REPETITION'
  | 'FIFTY_MOVE' | 'INSUFFICIENT' | 'AGREEMENT' | 'ABORTED' | 'ABANDONED';
export type GameStatus = 'WAITING' | 'PLAYING' | 'PAUSED' | 'FINISHED';
export type TimeClass = 'bullet' | 'blitz' | 'rapid';

export type MoveType =
  | 'normal' | 'capture' | 'en-passant'
  | 'kingside-castle' | 'queenside-castle'
  | 'promotion' | 'promotion-capture';

export interface ClockState {
  white: number;      // ms remaining as of lastTick (use liveRemaining for "now")
  black: number;
  increment: number;  // ms added to the mover after each legal move
  lastTick: number;   // server epoch ms when `active` started running
  active: Color | null; // null = stopped/paused
}

/** A move after the rules engine accepted it. Source of truth for all derived events. */
export interface AppliedMove {
  ply: number;                // 1-based half-move index
  moveNumber: number;         // full-move number (1, 1, 2, 2, ...)
  color: Color;
  piece: PieceType;
  from: Square;
  to: Square;
  san: string;
  captured: PieceType | null;
  captureSquare: Square | null; // differs from `to` for en passant
  promotion: PromotionPiece | null;
  moveType: MoveType;
  fenBefore: string;
  fenAfter: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  clockLeftMs: number;        // mover's clock after increment
  timestamp: number;          // server epoch ms
}

export interface GameState {
  id: string;                 // ULID
  whiteId: string;
  blackId: string;
  status: GameStatus;
  result: GameResult;
  termination: Termination | null;
  fen: string;
  pgn: string;
  history: AppliedMove[];     // full history: position is reconstructable by replay
  clocks: ClockState;
  timeClass: TimeClass;
  drawOfferedBy: Color | null;
  createdAt: number;
  updatedAt: number;
  version: number;            // optimistic concurrency, +1 on every persisted change
}
