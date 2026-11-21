import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { ServiceWorker } from './ServiceWorker';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';
import { generateSwSource, injectBuildId, SW_TEMPLATE_BUILD_ID_PLACEHOLDER } from '@/lib/sw-build';

interface MockWorker {
  state: string;
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: (event: Event) => void;
}

function createMockWorker(state = 'installed'): MockWorker {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((f) => f !== cb);
      }
    }),
    dispatchEvent: (event: Event) => {
      for (const cb of listeners[event.type] ?? []) cb(event);
    },
  };
}

interface MockRegistration {
  waiting: MockWorker | null;
  installing: MockWorker | null;
  active: MockWorker | null;
  update: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  trigger: (type: string, event?: Event) => void;
}

function createMockRegistration(): MockRegistration {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  return {
    waiting: null,
    installing: null,
    active: null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((f) => f !== cb);
      }
    }),
    trigger: (type: string, event = new Event(type)) => {
      for (const cb of listeners[type] ?? []) cb(event);
    },
  };
}

describe('useServiceWorkerUpdate hook', () => {
  let swListeners: Record<string, ((e: Event) => void)[]> = {};
  const originalLocation = window.location;

  beforeEach(() => {
    swListeners = {};
    const mockController = createMockWorker('activated');

    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: {
        controller: mockController,
        addEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
          swListeners[type] = swListeners[type] ?? [];
          swListeners[type].push(cb);
        }),
        removeEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
          if (swListeners[type]) swListeners[type] = swListeners[type].filter((f) => f !== cb);
        }),
      },
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('detects a waiting worker when an existing controller is controlling the page', () => {
    const reg = createMockRegistration();
    reg.waiting = createMockWorker('installed');

    const { result } = renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));
    expect(result.current.updateReady).toBe(true);
  });

  it('does NOT prompt when worker installs on first visit without prior controller', () => {
    Object.defineProperty(navigator.serviceWorker, 'controller', { value: null });
    const reg = createMockRegistration();
    reg.waiting = createMockWorker('installed');

    const { result } = renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));
    expect(result.current.updateReady).toBe(false);
  });

  it('detects an update arriving later via updatefound and statechange to installed', () => {
    const reg = createMockRegistration();
    const { result } = renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));
    expect(result.current.updateReady).toBe(false);

    const installingWorker = createMockWorker('installing');
    reg.installing = installingWorker;

    act(() => {
      reg.trigger('updatefound');
    });

    expect(result.current.updateReady).toBe(false);

    act(() => {
      installingWorker.state = 'installed';
      installingWorker.dispatchEvent(new Event('statechange'));
    });

    expect(result.current.updateReady).toBe(true);
  });

  it('applyUpdate posts SKIP_WAITING to the waiting worker', () => {
    const reg = createMockRegistration();
    const waitingWorker = createMockWorker('installed');
    reg.waiting = waitingWorker;

    const { result } = renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));
    act(() => {
      result.current.applyUpdate();
    });

    expect(waitingWorker.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
  });

  it('reloads exactly once when controllerchange fires after user accepted', () => {
    const reg = createMockRegistration();
    reg.waiting = createMockWorker('installed');

    const { result } = renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));
    act(() => {
      result.current.applyUpdate();
    });

    expect(window.location.reload).not.toHaveBeenCalled();

    act(() => {
      for (const cb of swListeners['controllerchange'] ?? []) cb(new Event('controllerchange'));
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);

    // Guard against reload loops on duplicate controllerchange events
    act(() => {
      for (const cb of swListeners['controllerchange'] ?? []) cb(new Event('controllerchange'));
    });
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload if controllerchange fires without user action', () => {
    const reg = createMockRegistration();
    reg.waiting = createMockWorker('installed');

    renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));

    act(() => {
      for (const cb of swListeners['controllerchange'] ?? []) cb(new Event('controllerchange'));
    });

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('cleans up event listeners on unmount', () => {
    const reg = createMockRegistration();
    const { unmount } = renderHook(() => useServiceWorkerUpdate(reg as unknown as ServiceWorkerRegistration));

    unmount();
    expect(reg.removeEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function));
    expect(navigator.serviceWorker.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });
});

describe('ServiceWorker update banner component', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { writable: true, configurable: true, value: true });
  });

  it('renders update prompt with role="status", actionable button, and dismiss capability', () => {
    const reg = createMockRegistration();
    const waitingWorker = createMockWorker('installed');
    reg.waiting = waitingWorker;

    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: {
        controller: createMockWorker('activated'),
        register: vi.fn().mockResolvedValue(reg),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      renderIntl(<ServiceWorker />);

      // The banner renders with role="status"
      const banner = screen.getByRole('status');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/A new version of SorobanPool is ready/i);

      // Real refresh button with accessible name
      const refreshBtn = screen.getByRole('button', { name: /Refresh to update/i });
      expect(refreshBtn).toBeInTheDocument();

      // Real dismiss button with accessible name
      const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
      expect(dismissBtn).toBeInTheDocument();

      // Dismissing hides the banner without reloading
      fireEvent.click(dismissBtn);
      expect(screen.queryByText(/A new version of SorobanPool is ready/i)).toBeNull();
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

describe('service worker build id injection and cache naming', () => {
  it('injects build id into service worker template and leaves no placeholder', () => {
    const testId = 'commit-abc1234';
    const source = generateSwSource(testId);

    expect(source).toContain(`const BUILD_ID = '${testId}';`);
    expect(source).not.toContain(SW_TEMPLATE_BUILD_ID_PLACEHOLDER);
    expect(source).toContain('const PREFIX = \'sorobanpool\';');
    expect(source).toContain('const STATIC = `${PREFIX}-static-${BUILD_ID}`;');
    expect(source).toContain('const PAGES = `${PREFIX}-pages-${BUILD_ID}`;');
    expect(source).toContain('const API = `${PREFIX}-api-${BUILD_ID}`;');
  });

  it('throws if build id is empty', () => {
    expect(() => injectBuildId('template __SW_BUILD_ID__', '')).toThrow();
  });
});
