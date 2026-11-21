import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initVitals, reportWebVitals } from './vitals';

describe('Web Vitals Reporter', () => {
  let mockSendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendBeacon = vi.fn(() => true);
    
    Object.defineProperty(global, 'navigator', {
      value: {
        sendBeacon: mockSendBeacon,
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(global, 'window', {
      value: {
        location: {
          pathname: '/test',
        },
      },
      writable: true,
      configurable: true,
    });

    // Reset Math.random to deterministic value
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initVitals', () => {
    it('initializes with default config in production', () => {
      initVitals({ enabled: true });
      
      reportWebVitals({
        name: 'LCP',
        value: 2500,
        rating: 'good',
        delta: 100,
        id: 'v3-1234',
      });

      expect(mockSendBeacon).toHaveBeenCalled();
    });

    it('respects custom sample rate', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // 50%
      
      initVitals({ sampleRate: 0.1, enabled: true }); // 10% sample rate
      
      reportWebVitals({
        name: 'CLS',
        value: 0.05,
        rating: 'good',
        delta: 0.01,
        id: 'v3-5678',
      });

      // Should not report because 0.5 > 0.1
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it('does not report when disabled', () => {
      initVitals({ enabled: false });
      
      reportWebVitals({
        name: 'INP',
        value: 100,
        rating: 'good',
        delta: 10,
        id: 'v3-9999',
      });

      expect(mockSendBeacon).not.toHaveBeenCalled();
    });
  });

  describe('reportWebVitals', () => {
    beforeEach(() => {
      initVitals({ sampleRate: 1.0, enabled: true }); // Report everything for testing
    });

    it('reports LCP metric', () => {
      reportWebVitals({
        name: 'LCP',
        value: 2500.5,
        rating: 'good',
        delta: 100,
        id: 'v3-lcp',
      });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const [url, blob] = mockSendBeacon.mock.calls[0];
      expect(url).toContain('/v1/vitals');
      
      // Parse the blob
      const reader = new FileReader();
      reader.onload = () => {
        const data = JSON.parse(reader.result as string);
        expect(data.name).toBe('LCP');
        expect(data.value).toBe(2501); // Rounded
        expect(data.rating).toBe('good');
        expect(data.url).toBe('/test');
      };
      reader.readAsText(blob);
    });

    it('reports INP metric', () => {
      reportWebVitals({
        name: 'INP',
        value: 150,
        rating: 'needs-improvement',
        delta: 50,
        id: 'v3-inp',
      });

      expect(mockSendBeacon).toHaveBeenCalled();
    });

    it('reports CLS metric', () => {
      reportWebVitals({
        name: 'CLS',
        value: 0.15,
        rating: 'needs-improvement',
        delta: 0.05,
        id: 'v3-cls',
      });

      expect(mockSendBeacon).toHaveBeenCalled();
    });

    it('does not include query params in URL', () => {
      Object.defineProperty(global.window, 'location', {
        value: {
          pathname: '/pools/123',
          search: '?secret=token',
        },
        writable: true,
      });

      reportWebVitals({
        name: 'LCP',
        value: 1000,
        rating: 'good',
        delta: 100,
        id: 'v3-test',
      });

      const [, blob] = mockSendBeacon.mock.calls[0];
      const reader = new FileReader();
      reader.onload = () => {
        const data = JSON.parse(reader.result as string);
        expect(data.url).toBe('/pools/123');
        expect(data.url).not.toContain('secret');
      };
      reader.readAsText(blob);
    });

    it('fails silently when sendBeacon is unavailable', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
      });

      expect(() => {
        reportWebVitals({
          name: 'LCP',
          value: 1000,
          rating: 'good',
          delta: 100,
          id: 'v3-fail',
        });
      }).not.toThrow();
    });

    it('fails silently on beacon error', () => {
      mockSendBeacon.mockImplementation(() => {
        throw new Error('Network error');
      });

      expect(() => {
        reportWebVitals({
          name: 'LCP',
          value: 1000,
          rating: 'good',
          delta: 100,
          id: 'v3-error',
        });
      }).not.toThrow();
    });
  });
});
