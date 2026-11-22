import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { InstallCard } from './InstallCard';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('standalone') ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function createBeforeInstallPromptEvent() {
  const event = new Event('beforeinstallprompt') as any;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  event.preventDefault = vi.fn();
  return event;
}

describe('InstallCard component (#70)', () => {
  let localStorageStore: Record<string, string> = {};
  let sessionStorageStore: Record<string, string> = {};

  beforeEach(() => {
    localStorageStore = {};
    sessionStorageStore = {};

    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => {
          localStorageStore[k] = v;
        },
        removeItem: (k: string) => {
          delete localStorageStore[k];
        },
        clear: () => {
          localStorageStore = {};
        },
      },
    });

    Object.defineProperty(window, 'sessionStorage', {
      writable: true,
      configurable: true,
      value: {
        getItem: (k: string) => sessionStorageStore[k] ?? null,
        setItem: (k: string, v: string) => {
          sessionStorageStore[k] = v;
        },
        removeItem: (k: string) => {
          delete sessionStorageStore[k];
        },
        clear: () => {
          sessionStorageStore = {};
        },
      },
    });

    mockMatchMedia(false);

    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile Safari/537.36',
    });
    Object.defineProperty(navigator, 'platform', {
      writable: true,
      configurable: true,
      value: 'Linux armv8l',
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: 5,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is NOT shown on the first visit', () => {
    renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.queryByText(/Install SorobanPool/i)).toBeNull();
    expect(localStorageStore['sp.install_visit_count']).toBe('1');
  });

  it('is shown on the second visit when beforeinstallprompt fires', () => {
    // Simulate visit 1 was counted in a past session
    localStorageStore['sp.install_visit_count'] = '1';

    renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByText(/Install SorobanPool/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Install app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Not now/i })).toBeInTheDocument();
    expect(localStorageStore['sp.install_visit_count']).toBe('2');
  });

  it('dismiss hides the card and stores the timestamp in localStorage', () => {
    localStorageStore['sp.install_visit_count'] = '1';
    renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    const dismissBtn = screen.getByRole('button', { name: /Not now/i });
    act(() => {
      fireEvent.click(dismissBtn);
    });

    expect(screen.queryByText(/Install SorobanPool/i)).toBeNull();
    expect(localStorageStore['sp.install_dismissed_at']).toBeDefined();
    const ts = parseInt(localStorageStore['sp.install_dismissed_at'], 10);
    expect(Date.now() - ts).toBeLessThan(1000);
  });

  it('stays hidden for 30 days after dismissal, and shows again after 30 days', () => {
    // Dismissed 10 days ago: should stay hidden
    localStorageStore['sp.install_visit_count'] = '2';
    sessionStorageStore['sp.install_session_counted'] = '1';
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    localStorageStore['sp.install_dismissed_at'] = String(tenDaysAgo);

    const { unmount } = renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.queryByText(/Install SorobanPool/i)).toBeNull();
    unmount();

    // Dismissed 31 days ago: should reappear on second visit
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorageStore['sp.install_dismissed_at'] = String(thirtyOneDaysAgo);

    renderIntl(<InstallCard />);
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.getByText(/Install SorobanPool/i)).toBeInTheDocument();
  });

  it('accept path calls prompt() on user click and handles accepted outcome', async () => {
    localStorageStore['sp.install_visit_count'] = '2';
    sessionStorageStore['sp.install_session_counted'] = '1';

    renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    const installBtn = screen.getByRole('button', { name: /Install app/i });
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Install SorobanPool/i)).toBeNull();
  });

  it('appinstalled event immediately hides the card', () => {
    localStorageStore['sp.install_visit_count'] = '2';
    sessionStorageStore['sp.install_session_counted'] = '1';

    renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.getByText(/Install SorobanPool/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByText(/Install SorobanPool/i)).toBeNull();
  });

  it('does NOT show when app is already running in standalone display mode', () => {
    mockMatchMedia(true);
    localStorageStore['sp.install_visit_count'] = '2';
    sessionStorageStore['sp.install_session_counted'] = '1';

    renderIntl(<InstallCard />);
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.queryByText(/Install SorobanPool/i)).toBeNull();
  });

  it('shows manual steps and no install button on iOS Safari', () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    });
    Object.defineProperty(navigator, 'platform', {
      writable: true,
      configurable: true,
      value: 'iPhone',
    });

    localStorageStore['sp.install_visit_count'] = '2';
    sessionStorageStore['sp.install_session_counted'] = '1';

    renderIntl(<InstallCard />);
    expect(screen.getByText(/Install SorobanPool/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap the Share button in Safari, then select "Add to Home Screen"/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Install app/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Not now/i })).toBeInTheDocument();
  });

  it('does NOT crash when localStorage throws in private mode', () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('QuotaExceeded or PrivateMode');
        },
        setItem: () => {
          throw new Error('QuotaExceeded or PrivateMode');
        },
      },
    });

    expect(() => renderIntl(<InstallCard />)).not.toThrow();
  });

  it('renders correctly in Nigerian Pidgin (pcm)', () => {
    localStorageStore['sp.install_visit_count'] = '2';
    sessionStorageStore['sp.install_session_counted'] = '1';

    renderIntl(<InstallCard />, { locale: 'pcm' });
    const event = createBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByText(/Install SorobanPool/i)).toBeInTheDocument();
    expect(screen.getByText(/Put SorobanPool for your phone screen/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Install app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No be now/i })).toBeInTheDocument();
  });
});
