'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from './api';

/** Minimal EventSource surface, so tests can supply a fake. */
export interface EventSourceLike {
  addEventListener(type: string, cb: (e: { data: string }) => void): void;
  close(): void;
}

export type StreamFactory = (url: string) => EventSourceLike;
export type StreamStatus = 'idle' | 'connecting' | 'live' | 'stale';

export interface PoolStreamPayload {
  totalUnits: number;
  members: number;
  state?: string;
  seq?: number;
  timestamp?: number;
}

export interface NextBreakInfo {
  currentTierIndex: number;
  unitsToNextBreak: number | null;
  nextTierPrice: bigint | null;
  isTopTier: boolean;
  isFull: boolean;
}

/**
 * Strict runtime type guard for SSE `pool` event payloads.
 * Rejects malformed JSON, non-objects, negative/non-integer/non-finite counts,
 * nonsensical zero-member positive-unit payloads, and invalid sequence/timestamp metadata.
 */
export function parsePoolStreamPayload(raw: string): PoolStreamPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const { totalUnits, members, state, seq, timestamp } = obj;
  if (typeof totalUnits !== 'number' || !Number.isSafeInteger(totalUnits) || totalUnits < 0) return null;
  if (typeof members !== 'number' || !Number.isSafeInteger(members) || members < 0) return null;
  if (totalUnits > 0 && members === 0) return null;

  if (state !== undefined && (typeof state !== 'string' || state.trim() === '')) return null;
  if (seq !== undefined && (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0)) return null;
  if (timestamp !== undefined && (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0)) {
    return null;
  }

  return {
    totalUnits,
    members,
    ...(state !== undefined ? { state } : {}),
    ...(seq !== undefined ? { seq } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
}

/**
 * Computes exact integer units remaining until the next tier threshold from the pool's tier table.
 * Returns `unitsToNextBreak: null` when at the top tier or when the pool is full.
 */
export function computeNextBreak(
  tiers: readonly { minUnits: number; unitPrice: bigint }[],
  totalUnits: number,
  maxUnits: number | null,
): NextBreakInfo {
  const sorted = [...tiers].sort((a, b) => a.minUnits - b.minUnits);
  const isFull = maxUnits !== null && totalUnits >= maxUnits;
  let currentTierIndex = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (totalUnits >= sorted[i]!.minUnits) currentTierIndex = i;
  }
  const nextTier = sorted.find((t) => t.minUnits > totalUnits) ?? null;
  if (isFull || !nextTier) {
    return {
      currentTierIndex,
      unitsToNextBreak: null,
      nextTierPrice: null,
      isTopTier: !nextTier && sorted.length > 0,
      isFull,
    };
  }
  return {
    currentTierIndex,
    unitsToNextBreak: nextTier.minUnits - totalUnits,
    nextTierPrice: nextTier.unitPrice,
    isTopTier: false,
    isFull: false,
  };
}

interface PoolListener {
  onFrame: (payload: PoolStreamPayload | null, isFirst: boolean) => void;
  onStatus?: (status: StreamStatus) => void;
}

interface SharedChannel {
  es: EventSourceLike;
  listeners: Set<PoolListener>;
  firstSeen: boolean;
  lastSeq: number | null;
  lastTimestamp: number | null;
  status: StreamStatus;
}

const sharedChannels = new Map<string, SharedChannel>();

function defaultStreamFactory(url: string): EventSourceLike {
  return new EventSource(url);
}

function attachChannel(id: string, make: StreamFactory, useShared: boolean): SharedChannel | null {
  if (useShared) {
    const existing = sharedChannels.get(id);
    if (existing) return existing;
  }

  let es: EventSourceLike;
  try {
    es = make(apiUrl(`/pools/${encodeURIComponent(id)}/stream`));
  } catch {
    return null;
  }

  const channel: SharedChannel = {
    es,
    listeners: new Set(),
    firstSeen: false,
    lastSeq: null,
    lastTimestamp: null,
    status: 'connecting',
  };

  const broadcastStatus = (next: StreamStatus) => {
    channel.status = next;
    for (const l of channel.listeners) l.onStatus?.(next);
  };

  es.addEventListener('open', () => {
    broadcastStatus('live');
  });

  es.addEventListener('error', () => {
    broadcastStatus('stale');
  });

  es.addEventListener('pool', (e) => {
    const isFirst = !channel.firstSeen;
    channel.firstSeen = true;
    if (channel.status !== 'live') {
      broadcastStatus('live');
    }

    const payload = parsePoolStreamPayload(e.data);
    if (payload !== null) {
      // Drop out-of-order or duplicate sequence/timestamp frames.
      // When neither seq nor timestamp is present, events are applied in arrival order.
      if (payload.seq !== undefined) {
        if (channel.lastSeq !== null && payload.seq <= channel.lastSeq) return;
        channel.lastSeq = payload.seq;
      } else if (payload.timestamp !== undefined) {
        if (channel.lastTimestamp !== null && payload.timestamp <= channel.lastTimestamp) return;
        channel.lastTimestamp = payload.timestamp;
      }
    }

    for (const l of channel.listeners) {
      l.onFrame(payload, isFirst);
    }
  });

  if (useShared) {
    sharedChannels.set(id, channel);
  }
  return channel;
}

/**
 * Low-level subscription sharing a single EventSource per pool id when using the default factory.
 * Calls `onFrame` with validated payloads (or `null` for empty/unstructured ping-like frames).
 */
export function subscribePoolEvents(
  id: string,
  listener: PoolListener,
  make?: StreamFactory,
): () => void {
  const useShared = make === undefined;
  const channel = attachChannel(id, make ?? defaultStreamFactory, useShared);
  if (!channel) return () => {};

  channel.listeners.add(listener);
  listener.onStatus?.(channel.status);

  return () => {
    channel.listeners.delete(listener);
    if (channel.listeners.size === 0) {
      channel.es.close();
      if (useShared) {
        sharedChannels.delete(id);
      }
    }
  };
}

/**
 * Subscribes to a pool's live stream and calls `onChange` for every update after the first (the first frame only
 * restates what the page just loaded). Returns a cleanup. EventSource reconnects by itself after a drop.
 */
export function subscribePool(
  id: string,
  onChange: () => void,
  make?: StreamFactory,
): () => void {
  return subscribePoolEvents(
    id,
    {
      onFrame(_payload, isFirst) {
        if (isFirst) return;
        onChange();
      },
    },
    make,
  );
}

/** Refreshes the cached pool as soon as the indexer applies an event; polling remains as the fallback. */
export function usePoolStream(id: string, enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !id) return;
    return subscribePool(id, () => void qc.invalidateQueries({ queryKey: ['pool', id] }));
  }, [id, enabled, qc]);
}

export interface LivePoolProgress {
  totalUnits: number;
  members: number;
  streamStatus: StreamStatus;
  announcement: 'tier' | 'full' | null;
}

const THROTTLE_MS = 100;
const EMPTY_TIERS: readonly { minUnits: number; unitPrice: string }[] = [];

/**
 * Subscribes to the shared pool SSE stream to deliver live units, member count, stale status,
 * and deduplicated polite announcements strictly for tier changes and pool fill.
 */
export function usePoolLiveProgress(
  pool: {
    id: string;
    totalUnits?: number;
    members?: number;
    maxUnits?: number | null;
    tiersUsdc?: readonly { minUnits: number; unitPrice: string }[];
  },
  options?: { enabled?: boolean; make?: StreamFactory; throttleMs?: number },
): LivePoolProgress {
  const enabled = options?.enabled ?? true;
  const make = options?.make;
  const throttleMs = options?.throttleMs ?? THROTTLE_MS;
  const initialTotalUnits = pool.totalUnits ?? 0;
  const initialMembers = pool.members ?? 0;
  const maxUnits = pool.maxUnits ?? null;
  const tiersUsdc = pool.tiersUsdc ?? EMPTY_TIERS;

  const [state, setState] = useState<{
    poolId: string;
    hasStreamData: boolean;
    totalUnits: number;
    members: number;
    streamStatus: StreamStatus;
    announcement: 'tier' | 'full' | null;
  }>(() => ({
    poolId: pool.id,
    hasStreamData: false,
    totalUnits: initialTotalUnits,
    members: initialMembers,
    streamStatus: 'idle',
    announcement: null,
  }));

  const tiersRef = useRef(tiersUsdc);
  const maxUnitsRef = useRef(maxUnits);
  useEffect(() => {
    tiersRef.current = tiersUsdc;
    maxUnitsRef.current = maxUnits;
  }, [tiersUsdc, maxUnits]);

  const initialBreak = computeNextBreak(
    tiersUsdc.map((x) => ({ minUnits: x.minUnits, unitPrice: BigInt(x.unitPrice) })),
    initialTotalUnits,
    maxUnits,
  );
  const highestTierRef = useRef<number>(initialBreak.currentTierIndex);
  const announcedFullRef = useRef<boolean>(initialBreak.isFull);

  useEffect(() => {
    if (!enabled || !pool.id) return;

    let lastFlush = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingState: { totalUnits: number; members: number; announcement: 'tier' | 'full' | null } | null = null;

    const flush = (next: { totalUnits: number; members: number; announcement: 'tier' | 'full' | null }) => {
      lastFlush = Date.now();
      setState((prev) => ({
        ...prev,
        poolId: pool.id,
        hasStreamData: true,
        totalUnits: next.totalUnits,
        members: next.members,
        announcement: next.announcement ?? prev.announcement,
      }));
    };

    const scheduleFlush = (next: { totalUnits: number; members: number; announcement: 'tier' | 'full' | null }) => {
      const elapsed = Date.now() - lastFlush;
      if (throttleMs <= 0 || elapsed >= throttleMs) {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        pendingState = null;
        flush(next);
      } else {
        // Preserve any major announcement accumulated inside the throttle window.
        const mergedAnnouncement =
          next.announcement === 'full' || pendingState?.announcement === 'full'
            ? 'full'
            : next.announcement ?? pendingState?.announcement ?? null;
        pendingState = { ...next, announcement: mergedAnnouncement };
        if (!pendingTimer) {
          pendingTimer = setTimeout(() => {
            pendingTimer = null;
            if (pendingState) {
              const toFlush = pendingState;
              pendingState = null;
              flush(toFlush);
            }
          }, throttleMs - elapsed);
        }
      }
    };

    const stop = subscribePoolEvents(
      pool.id,
      {
        onStatus(nextStatus) {
          setState((prev) => (prev.streamStatus === nextStatus ? prev : { ...prev, streamStatus: nextStatus }));
        },
        onFrame(payload, isFirst) {
          if (!payload) return;
          const tiers = tiersRef.current.map((x) => ({ minUnits: x.minUnits, unitPrice: BigInt(x.unitPrice) }));
          const nextBreak = computeNextBreak(tiers, payload.totalUnits, maxUnitsRef.current);

          let announcement: 'tier' | 'full' | null = null;
          if (isFirst) {
            // Never announce on the first snapshot after connecting; just align baseline.
            if (nextBreak.currentTierIndex > highestTierRef.current) {
              highestTierRef.current = nextBreak.currentTierIndex;
            }
            if (nextBreak.isFull) {
              announcedFullRef.current = true;
            }
          } else {
            if (nextBreak.isFull && !announcedFullRef.current) {
              announcedFullRef.current = true;
              announcement = 'full';
            } else if (nextBreak.currentTierIndex > highestTierRef.current) {
              highestTierRef.current = nextBreak.currentTierIndex;
              announcement = 'tier';
            }
          }

          scheduleFlush({
            totalUnits: payload.totalUnits,
            members: payload.members,
            announcement,
          });
        },
      },
      make,
    );

    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      stop();
    };
  }, [enabled, pool.id, make, throttleMs]);

  if (state.poolId !== pool.id || !state.hasStreamData) {
    return {
      totalUnits: initialTotalUnits,
      members: initialMembers,
      streamStatus: state.poolId === pool.id ? state.streamStatus : 'idle',
      announcement: null,
    };
  }

  return {
    totalUnits: state.totalUnits,
    members: state.members,
    streamStatus: state.streamStatus,
    announcement: state.announcement,
  };
}
