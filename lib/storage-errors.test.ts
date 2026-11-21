import { describe, it, expect, vi, beforeEach } from 'vitest';
import { session } from './api';

describe('Storage error handling', () => {
  let mockStorage: Record<string, string> = {};
  let shouldThrow = false;

  beforeEach(() => {
    mockStorage = {};
    shouldThrow = false;
    
    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => {
          if (shouldThrow) throw new DOMException('QuotaExceededError');
          return mockStorage[key] ?? null;
        }),
        setItem: vi.fn((key: string, value: string) => {
          if (shouldThrow) throw new DOMException('QuotaExceededError');
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          if (shouldThrow) throw new DOMException('QuotaExceededError');
          delete mockStorage[key];
        }),
      },
      writable: true,
    });
  });

  describe('session.set', () => {
    it('stores tokens when storage is available', () => {
      session.set({ accessToken: 'acc', refreshToken: 'ref' });
      expect(session.access).toBe('acc');
      expect(mockStorage['sp.refresh']).toBe('ref');
    });

    it('stores access token in memory when storage throws', () => {
      shouldThrow = true;
      session.set({ accessToken: 'acc', refreshToken: 'ref' });
      expect(session.access).toBe('acc');
      // Refresh token couldn't be stored, but access token is in memory
      expect(session.hasRefresh).toBe(false);
    });
  });

  describe('session.clear', () => {
    it('clears both memory and storage', () => {
      session.set({ accessToken: 'acc', refreshToken: 'ref' });
      session.clear();
      expect(session.access).toBeNull();
      expect(mockStorage['sp.refresh']).toBeUndefined();
    });

    it('clears memory even when storage throws', () => {
      session.set({ accessToken: 'acc', refreshToken: 'ref' });
      shouldThrow = true;
      session.clear();
      expect(session.access).toBeNull();
    });
  });

  describe('session.hasRefresh', () => {
    it('returns true when refresh token exists', () => {
      mockStorage['sp.refresh'] = 'token';
      expect(session.hasRefresh).toBe(true);
    });

    it('returns false when storage throws', () => {
      shouldThrow = true;
      expect(session.hasRefresh).toBe(false);
    });
  });
});
