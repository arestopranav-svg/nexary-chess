import type { GameResult } from '../../shared/types.ts';

/** Glicko-2 (Glickman, 2013). Pure functions; ratings are only ever written server-side. */
export interface GlickoRating { rating: number; rd: number; vol: number }
export const DEFAULT_RATING: GlickoRating = { rating: 1500, rd: 350, vol: 0.06 };
export const PROVISIONAL_GAMES = 10;
const TAU = 0.5;
const SCALE = 173.7178;
const EPS = 1e-6;

export interface GameOutcome { opponent: GlickoRating; score: 0 | 0.5 | 1 }

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

export function updateRating(p: GlickoRating, outcomes: readonly GameOutcome[]): GlickoRating {
  const mu = (p.rating - 1500) / SCALE;
  const phi = p.rd / SCALE;

  if (outcomes.length === 0) {
    return { ...p, rd: Math.min(350, SCALE * Math.sqrt(phi * phi + p.vol * p.vol)) };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const o of outcomes) {
    const muJ = (o.opponent.rating - 1500) / SCALE;
    const phiJ = o.opponent.rd / SCALE;
    const gj = g(phiJ);
    const ej = E(mu, muJ, phiJ);
    vInv += gj * gj * ej * (1 - ej);
    deltaSum += gj * (o.score - ej);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Volatility via the Illinois algorithm (step 5 of the paper).
  const a = Math.log(p.vol * p.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d2 = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d2 * d2) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;
  return { rating: SCALE * muNew + 1500, rd: SCALE * phiNew, vol };
}

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_GAMES;
}

/** Rate one finished game; both sides use PRE-game values of the opponent. */
export function rateGame(white: GlickoRating, black: GlickoRating, result: Exclude<GameResult, '*'>) {
  const ws = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const bs = (1 - ws) as 0 | 0.5 | 1;
  return {
    white: updateRating(white, [{ opponent: black, score: ws as 0 | 0.5 | 1 }]),
    black: updateRating(black, [{ opponent: white, score: bs }]),
  };
}
