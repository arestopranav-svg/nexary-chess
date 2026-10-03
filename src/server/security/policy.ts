export const POLICY = {
  disconnectGraceMs: 15_000,   // clock paused while a disconnected player may still be right back
  forfeitAfterMs: 90_000,      // not back by now => auto-resign
  recoveryTokenTtlMs: 120_000, // game:recovery token lifetime
  abortNoMoveMs: 60_000,       // nobody moved in time => abort (no rating change)
  maxMovesPerSecond: 20,       // per socket
} as const;

export type DisconnectPhase = 'GRACE_CLOCK_PAUSED' | 'CLOCK_RUNNING' | 'FORFEIT';

export function disconnectPhase(disconnectedAt: number, now: number): DisconnectPhase {
  const away = now - disconnectedAt;
  if (away >= POLICY.forfeitAfterMs) return 'FORFEIT';
  return away < POLICY.disconnectGraceMs ? 'GRACE_CLOCK_PAUSED' : 'CLOCK_RUNNING';
}

/** Abort only before the first move of the game, once nobody has moved within the window. */
export function abortDue(gameStartedAt: number, plyCount: number, now: number): boolean {
  return plyCount === 0 && now - gameStartedAt >= POLICY.abortNoMoveMs;
}
