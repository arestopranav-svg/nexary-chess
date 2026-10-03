import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEventBus } from '../src/shared/events.ts';
import type { GameEvent } from '../src/shared/events.ts';
import { deriveMoveEvents } from '../src/server/game/moveEvents.ts';
import type { AppliedMove } from '../src/shared/types.ts';

const base: AppliedMove = {
  ply: 1, moveNumber: 1, color: 'white', piece: 'p', from: 'e2', to: 'e4', san: 'e4',
  captured: null, captureSquare: null, promotion: null, moveType: 'normal',
  fenBefore: 'x', fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  isCheck: false, isCheckmate: false, isStalemate: false, clockLeftMs: 59_000, timestamp: 1234,
};
const types = (es: GameEvent[]) => es.map((e) => e.type);

test('plain move yields exactly MOVE, with Ghost Trace data attached', () => {
  const es = deriveMoveEvents('g1', base);
  assert.deepEqual(types(es), ['MOVE']);
  const e = es[0];
  assert.ok(e && e.type === 'MOVE');
  assert.deepEqual(e.payload.trace, {
    previousSquare: 'e2', currentSquare: 'e4', capturedPiece: null,
    moveType: 'normal', timestamp: 1234, player: 'white', moveNumber: 1,
  });
});

test('en passant: CAPTURE reports the pawn square, not the destination', () => {
  const es = deriveMoveEvents('g1', { ...base, piece: 'p', from: 'e5', to: 'd6', captured: 'p', captureSquare: 'd5', moveType: 'en-passant' });
  const cap = es.find((e) => e.type === 'CAPTURE');
  assert.ok(cap && cap.type === 'CAPTURE');
  assert.equal(cap.payload.square, 'd5');
  assert.equal(cap.payload.by, 'white');
});

test('castling emits CASTLE with correct rook squares for all four castles', () => {
  const cases: Array<[string, string, string, string, 'white' | 'black', 'kingside' | 'queenside']> = [
    ['e1', 'g1', 'h1', 'f1', 'white', 'kingside'], ['e1', 'c1', 'a1', 'd1', 'white', 'queenside'],
    ['e8', 'g8', 'h8', 'f8', 'black', 'kingside'], ['e8', 'c8', 'a8', 'd8', 'black', 'queenside'],
  ];
  for (const [from, to, rookFrom, rookTo, color, side] of cases) {
    const es = deriveMoveEvents('g1', { ...base, piece: 'k', from, to, color, moveType: side === 'kingside' ? 'kingside-castle' : 'queenside-castle' });
    const c = es.find((e) => e.type === 'CASTLE');
    assert.ok(c && c.type === 'CASTLE', `${from}${to}`);
    assert.deepEqual([c.payload.rookFrom, c.payload.rookTo, c.payload.side], [rookFrom, rookTo, side]);
  }
});

test('promotion capture emits MOVE, CAPTURE, PROMOTION in that order', () => {
  const es = deriveMoveEvents('g1', { ...base, piece: 'p', from: 'a7', to: 'b8', captured: 'n', captureSquare: 'b8', promotion: 'q', moveType: 'promotion-capture' });
  assert.deepEqual(types(es), ['MOVE', 'CAPTURE', 'PROMOTION']);
});

test('check names the checked king square; checkmate replaces CHECK', () => {
  const chk = deriveMoveEvents('g1', { ...base, isCheck: true, fenAfter: '4k3/8/8/8/8/8/8/4K2R b - - 1 1' });
  const c = chk.find((e) => e.type === 'CHECK');
  assert.ok(c && c.type === 'CHECK');
  assert.deepEqual([c.payload.color, c.payload.kingSquare], ['black', 'e8']);

  const mate = deriveMoveEvents('g1', { ...base, isCheck: true, isCheckmate: true });
  assert.deepEqual(types(mate), ['MOVE', 'CHECKMATE']);
});

test('stalemate is flagged on the move that causes it', () => {
  assert.deepEqual(types(deriveMoveEvents('g1', { ...base, isStalemate: true })), ['MOVE', 'STALEMATE']);
});

test('bus: typed on(), subscribe(), unsubscribe, and listener isolation', () => {
  const errors: unknown[] = [];
  const bus = new GameEventBus((err) => errors.push(err));
  const seen: string[] = [];
  bus.subscribe(() => { throw new Error('visual layer crashed'); });
  const offAll = bus.subscribe((e) => seen.push(`all:${e.type}`));
  const offMove = bus.on('MOVE', (e) => seen.push(`move:${e.payload.san}`));

  const [move] = deriveMoveEvents('g1', base);
  assert.ok(move);
  bus.emit(move);
  assert.deepEqual(seen, ['all:MOVE', 'move:e4']);
  assert.equal(errors.length, 1);

  offAll(); offMove();
  bus.emit(move);
  assert.equal(seen.length, 2);
});
