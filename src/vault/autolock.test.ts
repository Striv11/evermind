import { describe, expect, it } from 'vitest';
import { IdleLock, parseAutolockMinutes, type Scheduler } from './autolock';

function fake() {
  let now = 0;
  let timer: { at: number; fn: () => void } | null = null;
  const scheduler: Scheduler = {
    set: (fn, ms) => (timer = { at: now + ms, fn }),
    clear: (h) => {
      if (timer === h) timer = null;
    },
  };
  const advance = (ms: number) => {
    now += ms;
    if (timer && timer.at <= now) {
      const t = timer;
      timer = null;
      t.fn();
    }
  };
  return { scheduler, advance };
}

describe('IdleLock', () => {
  it('locks after the idle period and only once', () => {
    const f = fake();
    let locks = 0;
    const l = new IdleLock(5, () => locks++, f.scheduler);
    l.start();
    f.advance(5 * 60_000 - 1);
    expect(locks).toBe(0);
    f.advance(1);
    expect(locks).toBe(1);
    f.advance(10 * 60_000);
    expect(locks).toBe(1);
    expect(l.active).toBe(false);
  });

  it('activity postpones the lock', () => {
    const f = fake();
    let locks = 0;
    const l = new IdleLock(1, () => locks++, f.scheduler);
    l.start();
    f.advance(50_000);
    l.touch();
    f.advance(50_000);
    expect(locks).toBe(0);
    f.advance(10_000);
    expect(locks).toBe(1);
  });

  it('0 minutes disables; stop cancels; touch after stop does nothing', () => {
    const f = fake();
    let locks = 0;
    const off = new IdleLock(0, () => locks++, f.scheduler);
    off.start();
    f.advance(10 ** 9);
    expect(locks).toBe(0);
    const l = new IdleLock(1, () => locks++, f.scheduler);
    l.start();
    l.stop();
    l.touch();
    f.advance(10 ** 9);
    expect(locks).toBe(0);
  });

  it('changing the timeout re-arms a running lock', () => {
    const f = fake();
    let locks = 0;
    const l = new IdleLock(60, () => locks++, f.scheduler);
    l.start();
    l.setMinutes(1);
    f.advance(60_000);
    expect(locks).toBe(1);
  });
});

describe('parseAutolockMinutes', () => {
  it('accepts known choices and falls back to the default otherwise', () => {
    expect(parseAutolockMinutes('5')).toBe(5);
    expect(parseAutolockMinutes('0')).toBe(0);
    expect(parseAutolockMinutes('7')).toBe(15);
    expect(parseAutolockMinutes('abc')).toBe(15);
    expect(parseAutolockMinutes(null)).toBe(15);
    expect(parseAutolockMinutes('')).toBe(15);
  });
});
