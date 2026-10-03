import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createClock, startClock, liveRemaining, applyMoveToClock, pauseClock, resumeClock,
  flaggedColor, classifyTimeControl, PRESET_TIME_CONTROLS,
} from '../src/server/clock/clockEngine.ts';
import { createClockLoop } from '../src/server/clock/clockLoop.ts';
import type { ClockSnapshot } from '../src/server/clock/clockLoop.ts';

test('running clock charges only the active side', () => {
  const c = startClock(createClock(10_000, 0), 'white', 1000);
  assert.equal(liveRemaining(c, 'white', 1500), 9500);
  assert.equal(liveRemaining(c, 'black', 1500), 10_000);
});

test('move: subtracts elapsed, adds increment, flips active side', () => {
  const c = startClock(createClock(10_000, 1000), 'white', 0);
  const r = applyMoveToClock(c, 'white', 2000);
  assert.ok(r.ok);
  assert.equal(r.remaining, 9000); // 10000 - 2000 + 1000
  assert.equal(r.clock.active, 'black');
  assert.equal(r.clock.lastTick, 2000);
  assert.equal(r.clock.white, 9000);
});

test('move by the wrong side is rejected', () => {
  const c = startClock(createClock(10_000, 0), 'white', 0);
  const r = applyMoveToClock(c, 'black', 10);
  assert.deepEqual(r, { ok: false, reason: 'NOT_ACTIVE' });
});

test('move received after time expired loses on time, no increment awarded', () => {
  const c = startClock(createClock(1000, 5000), 'white', 0);
  const r = applyMoveToClock(c, 'white', 1500);
  assert.ok(!r.ok && r.reason === 'FLAGGED');
  assert.equal(r.clock.white, 0);
  assert.equal(r.clock.active, null);
});

test('flaggedColor is exact at zero and null before', () => {
  const c = startClock(createClock(1000, 0), 'black', 0);
  assert.equal(flaggedColor(c, 999), null);
  assert.equal(flaggedColor(c, 1000), 'black');
  assert.equal(flaggedColor(createClock(1000, 0), 5000), null); // not started
});

test('pause freezes time; resume continues from the frozen value', () => {
  let c = startClock(createClock(10_000, 0), 'white', 0);
  c = pauseClock(c, 3000);
  assert.equal(c.white, 7000);
  assert.equal(liveRemaining(c, 'white', 60_000), 7000);
  c = resumeClock(c, 'white', 60_000);
  assert.equal(liveRemaining(c, 'white', 61_000), 6000);
});

test('a backwards wall-clock step never credits time', () => {
  const c = startClock(createClock(10_000, 0), 'white', 5000);
  assert.equal(liveRemaining(c, 'white', 4000), 10_000);
});

test('invalid time controls are rejected', () => {
  assert.throws(() => createClock(0, 0), RangeError);
  assert.throws(() => createClock(1000, -1), RangeError);
});

test('time-class classification covers every preset', () => {
  const expected: Record<string, string> = {
    '1+0': 'bullet', '2+1': 'bullet', '3+0': 'blitz', '3+2': 'blitz', '5+0': 'blitz',
    '10+0': 'rapid', '10+5': 'rapid', '15+10': 'rapid',
  };
  for (const tc of PRESET_TIME_CONTROLS) {
    assert.equal(classifyTimeControl(tc.baseMs, tc.incrementMs), expected[tc.id], tc.id);
  }
  assert.equal(classifyTimeControl(420_000, 0), 'blitz');  // 7+0
  assert.equal(classifyTimeControl(480_000, 0), 'rapid');  // 8+0
});

test('clock loop: ticks every 100ms, 200ms check catches expiry, stops cleanly', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  try {
    const clock = startClock(createClock(500, 0), 'white', 0);
    const ticks: ClockSnapshot[] = [];
    const timeouts: Array<{ loser: string; at: number }> = [];
    const loop = createClockLoop({
      getClock: () => clock,
      onTick: (s) => ticks.push(s),
      onTimeout: (loser) => { timeouts.push({ loser, at: Date.now() }); loop.stop(); },
    });
    loop.start();
    // Step in 100ms increments: mocked Date jumps to the end of a single large tick() window.
    for (let i = 0; i < 20; i++) mock.timers.tick(100);

    assert.deepEqual(timeouts, [{ loser: 'white', at: 600 }]); // expired at 500ms, first 200ms check at/after is t=600
    assert.equal(ticks[0]?.serverTime, 100);
    assert.equal(ticks[0]?.white, 400);
    assert.ok(ticks.length >= 5 && ticks.length <= 6, `unexpected tick count: ${ticks.length}`);
  } finally {
    mock.timers.reset();
  }
});
