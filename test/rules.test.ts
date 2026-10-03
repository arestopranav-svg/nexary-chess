// Requires `npm install` (chess.js). NOT executed in the authoring sandbox (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChessJsRules } from '../src/server/game/rules.ts';

const ctx = { clockLeftMs: 1000, timestamp: 1 };
const play = (r: ChessJsRules, ...moves: string[]) => {
  for (const mv of moves) {
    const m = r.tryMove({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] }, ctx);
    assert.ok(m, `illegal in test: ${mv}`);
  }
};

test("fool's mate: checkmate, black wins", () => {
  const r = new ChessJsRules();
  play(r, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.deepEqual(r.outcome(), { over: true, result: '0-1', termination: 'CHECKMATE' });
});

test('stalemate position is a draw', () => {
  const r = new ChessJsRules('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(r.outcome(), { over: true, result: '1/2-1/2', termination: 'STALEMATE' });
});

test('castling both sides on a fresh move', () => {
  const k = new ChessJsRules('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').tryMove({ from: 'e1', to: 'g1' }, ctx);
  assert.equal(k?.moveType, 'kingside-castle');
  assert.equal(k?.san, 'O-O');
  const q = new ChessJsRules('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').tryMove({ from: 'e1', to: 'c1' }, ctx);
  assert.equal(q?.moveType, 'queenside-castle');
});

test('en passant captures the pawn on d5, not d6', () => {
  const m = new ChessJsRules('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1').tryMove({ from: 'e5', to: 'd6' }, ctx);
  assert.equal(m?.moveType, 'en-passant');
  assert.equal(m?.captured, 'p');
  assert.equal(m?.captureSquare, 'd5');
});

test('promotion to every piece; missing/garbage promotion is illegal', () => {
  for (const p of ['q', 'r', 'b', 'n']) {
    const m = new ChessJsRules('4k3/P7/8/8/8/8/8/4K3 w - - 0 1').tryMove({ from: 'a7', to: 'a8', promotion: p }, ctx);
    assert.equal(m?.promotion, p);
    assert.equal(m?.moveType, 'promotion');
  }
  assert.equal(new ChessJsRules('4k3/P7/8/8/8/8/8/4K3 w - - 0 1').tryMove({ from: 'a7', to: 'a8' }, ctx), null);
  assert.equal(new ChessJsRules('4k3/P7/8/8/8/8/8/4K3 w - - 0 1').tryMove({ from: 'a7', to: 'a8', promotion: 'k' }, ctx), null);
});

test('illegal and malformed moves return null and do not change the position', () => {
  const r = new ChessJsRules();
  const before = r.fen();
  assert.equal(r.tryMove({ from: 'e2', to: 'e5' }, ctx), null);
  assert.equal(r.tryMove({ from: 'z9', to: 'e4' }, ctx), null);
  assert.equal(r.tryMove({ from: 'e7', to: 'e5' }, ctx), null); // not your piece
  assert.equal(r.fen(), before);
});

test('insufficient material (K vs K)', () => {
  assert.equal(new ChessJsRules('4k3/8/8/8/8/8/8/4K3 w - - 0 1').outcome().over, true);
});

test('fifty-move rule triggers when the halfmove clock reaches 100', () => {
  const r = new ChessJsRules('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
  assert.equal(r.outcome().over, false);
  play(r, 'a1a2');
  assert.deepEqual(r.outcome(), { over: true, result: '1/2-1/2', termination: 'FIFTY_MOVE' });
});

test('threefold repetition after knights shuffle twice', () => {
  const r = new ChessJsRules();
  play(r, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1');
  assert.equal(r.outcome().over, false);
  play(r, 'f6g8');
  assert.deepEqual(r.outcome(), { over: true, result: '1/2-1/2', termination: 'REPETITION' });
});
