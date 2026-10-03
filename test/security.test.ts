import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disconnectPhase, abortDue } from '../src/server/security/policy.ts';
import { createRateLimiter } from '../src/server/security/rateLimiter.ts';
import { issueRecoveryToken, verifyRecoveryToken } from '../src/server/security/recoveryToken.ts';

test('disconnect phases: 15s grace, then running, forfeit at 90s', () => {
  assert.equal(disconnectPhase(0, 0), 'GRACE_CLOCK_PAUSED');
  assert.equal(disconnectPhase(0, 14_999), 'GRACE_CLOCK_PAUSED');
  assert.equal(disconnectPhase(0, 15_000), 'CLOCK_RUNNING');
  assert.equal(disconnectPhase(0, 89_999), 'CLOCK_RUNNING');
  assert.equal(disconnectPhase(0, 90_000), 'FORFEIT');
});

test('abort only when nobody has moved within 60s', () => {
  assert.equal(abortDue(0, 0, 59_999), false);
  assert.equal(abortDue(0, 0, 60_000), true);
  assert.equal(abortDue(0, 1, 120_000), false);
});

test('rate limiter: 20/s burst, refills over time, per-key isolation', () => {
  let t = 0;
  const rl = createRateLimiter(20, 20, () => t);
  for (let i = 0; i < 20; i++) assert.equal(rl.tryConsume('a'), true);
  assert.equal(rl.tryConsume('a'), false);
  assert.equal(rl.tryConsume('b'), true);
  t = 50; // one token refilled
  assert.equal(rl.tryConsume('a'), true);
  assert.equal(rl.tryConsume('a'), false);
  t = 5000;
  for (let i = 0; i < 20; i++) assert.equal(rl.tryConsume('a'), true);
  assert.equal(rl.tryConsume('a'), false);
});

const SECRET = 'x'.repeat(40);

test('recovery token: round trip, expiry, tamper, wrong secret, malformed', () => {
  const tok = issueRecoveryToken('game1', 'user1', SECRET, 1000, 120_000);
  assert.deepEqual(verifyRecoveryToken(tok, SECRET, 1001), { gameId: 'game1', userId: 'user1', exp: 121_000 });
  assert.equal(verifyRecoveryToken(tok, SECRET, 121_000), null);
  assert.equal(verifyRecoveryToken(tok, 'y'.repeat(40), 1001), null);

  const sig = tok.split('.')[1];
  const forgedBody = Buffer.from(JSON.stringify({ gameId: 'game1', userId: 'attacker', exp: 9e15 })).toString('base64url');
  assert.equal(verifyRecoveryToken(`${forgedBody}.${sig}`, SECRET, 1001), null);

  assert.equal(verifyRecoveryToken('a.b.c', SECRET, 0), null);
  assert.equal(verifyRecoveryToken('nodot', SECRET, 0), null);
  assert.throws(() => issueRecoveryToken('g', 'u', 'short', 0, 1000));
});
