import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { useSession } from '@/lib/store';
import Settings from './page';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh }), usePathname: () => '/settings' }));
vi.mock('@/lib/auth', () => ({ useRequireAuth: () => ({ ready: true }) }));
vi.mock('@/lib/passkey', () => ({
  listPasskeys: vi.fn(async () => []),
  passkeyCancelled: () => false,
  removePasskey: vi.fn(),
  registerPasskey: vi.fn(),
  usePasskeySupport: () => false,
}));
vi.mock('@/lib/wallet', () => ({ backupSecret: vi.fn(), confirmWithDevice: vi.fn(), loadWallet: vi.fn(async () => null), clearWallet: vi.fn() }));
const api = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({}));
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => api(...args), session: { access: null, hasRefresh: false, set: vi.fn(), clear: vi.fn() } }));

const clearCookie = () => (document.cookie = 'locale=; path=/; max-age=0');
const renderSettings = () =>
  renderIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Settings />
    </QueryClientProvider>,
  );

describe('Settings language choice (#51)', () => {
  beforeEach(() => {
    clearCookie();
    api.mockClear();
    refresh.mockClear();
  });

  it('saves the choice to the profile with PATCH /me when signed in, and sets the cookie', async () => {
    useSession.setState({ status: 'authed', me: { id: '1', phone: '+234', displayName: null, language: 'en', walletAddress: null, roles: [] } });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Pidgin' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('/me', { method: 'PATCH', body: { language: 'pcm' }, actionType: 'save-language' });
    expect(document.cookie).toContain('locale=pcm');
  });

  it('only sets the cookie when signed out', async () => {
    useSession.setState({ status: 'anon', me: null });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).not.toHaveBeenCalledWith('/me', expect.anything());
    expect(document.cookie).toContain('locale=en');
  });

  it('marks the current language as pressed', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pidgin' })).toHaveAttribute('aria-pressed', 'false');
  });
});
