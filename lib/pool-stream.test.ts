import { describe, expect, it, vi } from 'vitest';
import {
  computeNextBreak,
  parsePoolStreamPayload,
  subscribePool,
  subscribePoolEvents,
  type EventSourceLike,
} from './pool-stream';

class FakeSource implements EventSourceLike {
  handlers = new Map<string, ((e: { data: string }) => void)[]>();
  closed = false;
  constructor(readonly url: string) {}
  addEventListener(type: string, cb: (e: { data: string }) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data = '{}') {
    for (const cb of this.handlers.get(type) ?? []) cb({ data });
  }
}

describe('subscribePool', () => {
  it('ignores the first frame, reacts to later ones, ignores pings, and closes on cleanup', () => {
    let src!: FakeSource;
    const onChange = vi.fn();
    const stop = subscribePool('42', onChange, (u) => (src = new FakeSource(u)));
    expect(src.url).toMatch(/\/v1\/pools\/42\/stream$/);
    src.emit('pool');
    expect(onChange).not.toHaveBeenCalled();
    src.emit('pool');
    src.emit('ping');
    src.emit('pool');
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
    expect(src.closed).toBe(true);
  });

  it('survives environments where EventSource cannot be created', () => {
    const stop = subscribePool('1', vi.fn(), () => {
      throw new Error('unsupported');
    });
    expect(() => stop()).not.toThrow();
  });

  it('validates payloads strictly and rejects invalid shapes, negative or non-integer counts', () => {
    expect(parsePoolStreamPayload('{"totalUnits":50,"members":4}')).toEqual({ totalUnits: 50, members: 4 });
    expect(parsePoolStreamPayload('{"totalUnits":0,"members":0}')).toEqual({ totalUnits: 0, members: 0 });
    expect(parsePoolStreamPayload('{"totalUnits":50,"members":4,"seq":3,"timestamp":1700000000}')).toEqual({
      totalUnits: 50,
      members: 4,
      seq: 3,
      timestamp: 1700000000,
    });
    expect(parsePoolStreamPayload('not-json')).toBeNull();
    expect(parsePoolStreamPayload('null')).toBeNull();
    expect(parsePoolStreamPayload('[]')).toBeNull();
    expect(parsePoolStreamPayload('{"totalUnits":-1,"members":2}')).toBeNull();
    expect(parsePoolStreamPayload('{"totalUnits":10.5,"members":2}')).toBeNull();
    expect(parsePoolStreamPayload('{"totalUnits":10,"members":-1}')).toBeNull();
    expect(parsePoolStreamPayload('{"totalUnits":10,"members":0}')).toBeNull();
    expect(parsePoolStreamPayload('{"totalUnits":"10","members":2}')).toBeNull();
    expect(parsePoolStreamPayload('{"totalUnits":10,"members":2,"seq":-1}')).toBeNull();
  });

  it('ignores out-of-order seq and timestamp events', () => {
    let src!: FakeSource;
    const seen: number[] = [];
    const stop = subscribePoolEvents(
      '55',
      {
        onFrame(payload) {
          if (payload) seen.push(payload.totalUnits);
        },
      },
      (u) => (src = new FakeSource(u)),
    );
    src.emit('pool', JSON.stringify({ totalUnits: 60, members: 3, seq: 10 }));
    src.emit('pool', JSON.stringify({ totalUnits: 55, members: 3, seq: 9 }));
    src.emit('pool', JSON.stringify({ totalUnits: 60, members: 3, seq: 10 }));
    src.emit('pool', JSON.stringify({ totalUnits: 75, members: 4, seq: 11 }));
    expect(seen).toEqual([60, 75]);
    stop();
  });

  it('computes exact integer units to the next price break and handles top tier / full pool', () => {
    const tiers = [
      { minUnits: 100, unitPrice: 10_000_000n },
      { minUnits: 200, unitPrice: 9_000_000n },
    ];
    expect(computeNextBreak(tiers, 60, 250)).toEqual({
      currentTierIndex: -1,
      unitsToNextBreak: 40,
      nextTierPrice: 10_000_000n,
      isTopTier: false,
      isFull: false,
    });
    expect(computeNextBreak(tiers, 140, 250)).toEqual({
      currentTierIndex: 0,
      unitsToNextBreak: 60,
      nextTierPrice: 9_000_000n,
      isTopTier: false,
      isFull: false,
    });
    expect(computeNextBreak(tiers, 200, 250)).toEqual({
      currentTierIndex: 1,
      unitsToNextBreak: null,
      nextTierPrice: null,
      isTopTier: true,
      isFull: false,
    });
    expect(computeNextBreak(tiers, 250, 250)).toEqual({
      currentTierIndex: 1,
      unitsToNextBreak: null,
      nextTierPrice: null,
      isTopTier: true,
      isFull: true,
    });
  });

  it('shares a single EventSource when using the default EventSource constructor and closes on last unmount', () => {
    const created: FakeSource[] = [];
    const prevES = globalThis.EventSource;
    class MockGlobalES extends FakeSource {
      constructor(url: string) {
        super(url);
        created.push(this);
      }
    }
    (globalThis as unknown as { EventSource: unknown }).EventSource = MockGlobalES;
    try {
      const a = vi.fn();
      const b = vi.fn();
      const stopA = subscribePoolEvents('shared-1', { onFrame: a });
      const stopB = subscribePoolEvents('shared-1', { onFrame: b });
      expect(created).toHaveLength(1);
      created[0]!.emit('pool', JSON.stringify({ totalUnits: 10, members: 1 }));
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);

      stopA();
      expect(created[0]!.closed).toBe(false);
      stopB();
      expect(created[0]!.closed).toBe(true);
    } finally {
      (globalThis as unknown as { EventSource: unknown }).EventSource = prevES;
    }
  });
});
