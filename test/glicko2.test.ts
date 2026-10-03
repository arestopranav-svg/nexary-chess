import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateRating, rateGame, isProvisional, DEFAULT_RATING } from '../src/server/rating/glicko2.ts';

const near = (a: number, b: number, tol: number, label: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${label}: got ${a}, expected ${b} ±${tol}`);

test("matches Glickman's published worked example", () => {
  const out = updateRating({ rating: 1500, rd: 200, vol: 0.06 }, [
    { opponent: { rating: 1400, rd: 30, vol: 0.06 }, score: 1 },
    { opponent: { rating: 1550, rd: 100, vol: 0.06 }, score: 0 },
    { opponent: { rating: 1700, rd: 300, vol: 0.06 }, score: 0 },
  ]);
  near(out.rating, 1464.06, 0.01, 'rating');
  near(out.rd, 151.52, 0.01, 'rd');
  near(out.vol, 0.05999, 0.0001, 'vol');
});

test('equal new players: winner gains what the loser drops (same RD)', () => {
  const r = rateGame(DEFAULT_RATING, DEFAULT_RATING, '1-0');
  assert.ok(r.white.rating > 1500 && r.black.rating < 1500);
  near(r.white.rating - 1500, 1500 - r.black.rating, 1e-6, 'symmetry');
  assert.ok(r.white.rd < 350 && r.black.rd < 350, 'RD shrinks after a game');
});

test('a draw between equals leaves ratings unchanged', () => {
  const r = rateGame(DEFAULT_RATING, DEFAULT_RATING, '1/2-1/2');
  near(r.white.rating, 1500, 1e-6, 'white');
  near(r.black.rating, 1500, 1e-6, 'black');
});

test('inactivity only grows RD (capped at 350)', () => {
  const p = { rating: 1700, rd: 80, vol: 0.06 };
  const out = updateRating(p, []);
  assert.equal(out.rating, 1700);
  assert.ok(out.rd > 80 && out.rd <= 350);
});

test('provisional until 10 games', () => {
  assert.equal(isProvisional(9), true);
  assert.equal(isProvisional(10), false);
});
