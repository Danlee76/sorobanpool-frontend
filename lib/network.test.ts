import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPrefetch,
  canPrefetchConnection,
  getOnlineStatus,
  reportFetchFailure,
  reportFetchSuccess,
  useOnlineStatus,
} from './network';

describe('canPrefetchConnection', () => {
  it('returns true when connection object is missing or null', () => {
    expect(canPrefetchConnection(undefined)).toBe(true);
    expect(canPrefetchConnection(null)).toBe(true);
  });

  it('returns true for empty connection object or missing fields', () => {
    expect(canPrefetchConnection({})).toBe(true);
    expect(canPrefetchConnection({ saveData: false })).toBe(true);
  });

  it('returns false when saveData is true, regardless of effectiveType', () => {
    expect(canPrefetchConnection({ saveData: true })).toBe(false);
    expect(canPrefetchConnection({ saveData: true, effectiveType: '4g' })).toBe(false);
    expect(canPrefetchConnection({ saveData: true, effectiveType: '3g' })).toBe(false);
  });

  it('returns false when effectiveType is slow-2g or 2g', () => {
    expect(canPrefetchConnection({ effectiveType: 'slow-2g' })).toBe(false);
    expect(canPrefetchConnection({ effectiveType: '2g' })).toBe(false);
    expect(canPrefetchConnection({ saveData: false, effectiveType: '2g' })).toBe(false);
  });

  it('returns true when effectiveType is 3g, 4g, or other high-speed types', () => {
    expect(canPrefetchConnection({ effectiveType: '3g' })).toBe(true);
    expect(canPrefetchConnection({ effectiveType: '4g' })).toBe(true);
    expect(canPrefetchConnection({ saveData: false, effectiveType: '4g' })).toBe(true);
  });
});

describe('canPrefetch in browser environment', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('reads navigator.connection correctly', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        connection: { saveData: false, effectiveType: '4g' },
      },
      writable: true,
      configurable: true,
    });
    expect(canPrefetch()).toBe(true);

    Object.defineProperty(global, 'navigator', {
      value: {
        connection: { saveData: true, effectiveType: '4g' },
      },
      writable: true,
      configurable: true,
    });
    expect(canPrefetch()).toBe(false);

    Object.defineProperty(global, 'navigator', {
      value: {
        connection: { saveData: false, effectiveType: '2g' },
      },
      writable: true,
      configurable: true,
    });
    expect(canPrefetch()).toBe(false);
  });

  it('defaults to true when navigator has no connection object', () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(canPrefetch()).toBe(true);
  });
});

describe('online / offline status tracking', () => {
  beforeEach(() => {
    reportFetchSuccess();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('tracks online and offline events', () => {
    expect(getOnlineStatus()).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(getOnlineStatus()).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(getOnlineStatus()).toBe(true);
  });

  it('marks offline when a fetch failure is reported', () => {
    expect(getOnlineStatus()).toBe(true);

    act(() => {
      reportFetchFailure();
    });
    expect(getOnlineStatus()).toBe(false);

    act(() => {
      reportFetchSuccess();
    });
    expect(getOnlineStatus()).toBe(true);
  });

  it('useOnlineStatus hook reacts to network changes', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
