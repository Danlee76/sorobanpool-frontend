import { beforeEach, describe, expect, it, vi } from 'vitest';

const me = { id: '1', phone: '+234', displayName: null, language: 'PCM', walletAddress: null, roles: [] as string[] };
const api = vi.fn<(...args: unknown[]) => Promise<typeof me>>(async () => me);
vi.mock('./api', () => ({ api: (...args: unknown[]) => api(...args), session: { set: vi.fn(), clear: vi.fn(), access: 'a', hasRefresh: true } }));
vi.mock('./wallet', () => ({ loadWallet: vi.fn(async () => null), clearWallet: vi.fn() }));
vi.mock('./offline-queue', () => ({ initOfflineQueue: vi.fn() }));
vi.mock('@/components/ServiceWorker', () => ({ clearApiCache: vi.fn() }));

const { useSession } = await import('./store');
const tokens = { accessToken: 'a', refreshToken: 'r' };

describe('sign-in applies the profile language (#51)', () => {
  beforeEach(() => {
    document.cookie = 'locale=; path=/; max-age=0';
    me.language = 'PCM';
  });

  it('sets the cookie from the profile when this device has no choice yet', async () => {
    expect(await useSession.getState().signedIn(tokens)).toBe(true);
    expect(document.cookie).toContain('locale=pcm');
  });

  it('keeps an explicit choice already made on this device', async () => {
    document.cookie = 'locale=en; path=/';
    expect(await useSession.getState().signedIn(tokens)).toBe(false);
    expect(document.cookie).toContain('locale=en');
    expect(document.cookie).not.toContain('locale=pcm');
  });

  it('ignores a profile language the app does not ship', async () => {
    me.language = 'fr';
    expect(await useSession.getState().signedIn(tokens)).toBe(false);
    expect(document.cookie).not.toContain('locale=');
  });
});
