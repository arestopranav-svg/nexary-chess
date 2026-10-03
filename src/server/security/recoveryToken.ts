import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RecoveryClaims { gameId: string; userId: string; exp: number }

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** HMAC-signed, expiring token. `secret` must come from server env, never from client code. */
export function issueRecoveryToken(gameId: string, userId: string, secret: string, now: number, ttlMs: number): string {
  if (secret.length < 32) throw new Error('recovery secret must be at least 32 chars');
  const body = b64(JSON.stringify({ gameId, userId, exp: now + ttlMs } satisfies RecoveryClaims));
  const sig = createHmac('sha256', secret).update(body).digest();
  return `${body}.${b64(sig)}`;
}

export function verifyRecoveryToken(token: string, secret: string, now: number): RecoveryClaims | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<RecoveryClaims>;
    if (typeof c.gameId !== 'string' || typeof c.userId !== 'string' || typeof c.exp !== 'number') return null;
    return c.exp > now ? { gameId: c.gameId, userId: c.userId, exp: c.exp } : null;
  } catch { return null; }
}
