import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { ApiError } from '@/lib/api';
import {
  ALLOWED_ERROR_ROUTES,
  errorAction,
  errorKeys,
  isAllowedErrorRoute,
  type ErrorAction,
} from '@/lib/errors/map';
import { ErrorExplainer, explain } from './feedback/ErrorExplainer';

async function violations(el: HTMLElement) {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('errorAction – code-to-action table', () => {
  it('310 (DeadlinePassed) maps to internal /explore route', () => {
    const a = errorAction(310) as Extract<ErrorAction, { type: 'route' }>;
    expect(a).toEqual({ type: 'route', route: '/explore', labelKey: 'errors.310.action' });
  });

  it('319 (TooManyMembers) and 308 (PoolNotFound) map to /explore', () => {
    expect(errorAction(319)).toEqual({ type: 'route', route: '/explore', labelKey: 'errors.319.action' });
    expect(errorAction(308)).toEqual({ type: 'route', route: '/explore', labelKey: 'errors.308.action' });
  });

  it('315, 316, 317 (cap reached) map to in-page focus-units action', () => {
    for (const code of [315, 316, 317]) {
      expect(errorAction(code)).toEqual({
        type: 'in-page',
        action: 'focus-units',
        labelKey: `errors.${code}.action`,
        targetId: 'units',
      });
    }
  });

  it('315-317 include remainingAllowance parameter when provided in context', () => {
    expect(errorAction(317, { remainingAllowance: 4 })).toEqual({
      type: 'in-page',
      action: 'focus-units',
      labelKey: 'errors.actions.reduceUnitsTo',
      targetId: 'units',
      remainingAllowance: 4,
      params: { count: 4 },
    });
    // Non-positive or non-integer allowance is ignored
    expect(errorAction(317, { remainingAllowance: 0 })).toEqual({
      type: 'in-page',
      action: 'focus-units',
      labelKey: 'errors.317.action',
      targetId: 'units',
    });
  });

  it('318 (OverTierCap), 312 (ZeroUnits), 320 (AlreadyCommitted) map to in-page focus-units', () => {
    for (const code of [318, 312, 320]) {
      expect(errorAction(code)).toEqual({
        type: 'in-page',
        action: 'focus-units',
        labelKey: `errors.${code}.action`,
        targetId: 'units',
      });
    }
  });

  it('339 (NothingToClaim) maps to /history', () => {
    expect(errorAction(339)).toEqual({ type: 'route', route: '/history', labelKey: 'errors.339.action' });
  });

  it('501 (InsufficientFreeBond) maps to /supplier/bond', () => {
    expect(errorAction(501)).toEqual({ type: 'route', route: '/supplier/bond', labelKey: 'errors.501.action' });
  });

  it('INSUFFICIENT_BALANCE maps to in-page select-naira top-up action', () => {
    expect(errorAction('INSUFFICIENT_BALANCE')).toEqual({
      type: 'in-page',
      action: 'select-naira',
      labelKey: 'errors.actions.topUpNaira',
      targetId: 'naira-deposit',
    });
  });

  it('unknown or unmapped codes return none', () => {
    expect(errorAction(999)).toEqual({ type: 'none' });
    expect(errorAction(301)).toEqual({ type: 'none' });
    expect(errorAction(undefined)).toEqual({ type: 'none' });
  });

  it('allow-list rejects external or arbitrary URLs', () => {
    expect(ALLOWED_ERROR_ROUTES.every((r) => isAllowedErrorRoute(r))).toBe(true);
    expect(isAllowedErrorRoute('https://evil.example')).toBe(false);
    expect(isAllowedErrorRoute('//evil.example')).toBe(false);
    expect(isAllowedErrorRoute('javascript:alert(1)')).toBe(false);
  });

  it('errorKeys returns action for known codes and generic fallback for unknown', () => {
    const known = errorKeys(310);
    expect(known.what).toBe('errors.310.what');
    expect(known.todo).toBe('errors.310.todo');
    expect(known.action.type).toBe('route');

    const unknown = errorKeys(999);
    expect(unknown.what).toBe('errors.generic.what');
    expect(unknown.action).toEqual({ type: 'none' });
  });
});

describe('explain with recovery actions', () => {
  it('attaches mapped actions for contract and balance errors', () => {
    expect(explain(new ApiError(422, 'CONTRACT_ERROR', 'x', 310)).action.type).toBe('route');
    expect(explain(new ApiError(422, 'CONTRACT_ERROR', 'x', 315)).action.type).toBe('in-page');
    expect(explain(new ApiError(400, 'INSUFFICIENT_BALANCE', 'x')).action.type).toBe('in-page');
  });

  it('returns none action for unknown contract codes and generic errors', () => {
    expect(explain(new ApiError(422, 'CONTRACT_ERROR', 'x', 999)).action).toEqual({ type: 'none' });
    expect(explain(new TypeError('fetch failed')).action).toEqual({ type: 'none' });
    expect(explain(new Error('unexpected')).action).toEqual({ type: 'none' });
  });
});

describe('ErrorExplainer component with recovery actions', () => {
  it('renders a real link with internal target for route actions (310, 339, 501)', () => {
    const { unmount } = renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 310)} />);
    const link = screen.getByRole('link', { name: 'View other pools' });
    expect(link).toHaveAttribute('href', '/explore');
    unmount();

    const r2 = renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 339)} />);
    expect(screen.getByRole('link', { name: 'View past group buys' })).toHaveAttribute('href', '/history');
    r2.unmount();

    renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 501)} />);
    expect(screen.getByRole('link', { name: 'Top up supplier bond' })).toHaveAttribute('href', '/supplier/bond');
  });

  it('renders a real button for in-page actions and calls onAction callback', () => {
    const onAction = vi.fn();
    renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 315)} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reduce units' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: 'in-page',
      action: 'focus-units',
      labelKey: 'errors.315.action',
      targetId: 'units',
    });
  });

  it('shows remaining allowance in the button label when present on the error', () => {
    const err = Object.assign(new ApiError(422, 'CONTRACT_ERROR', 'x', 317), { remainingAllowance: 3 });
    const onAction = vi.fn();
    renderIntl(<ErrorExplainer error={err} onAction={onAction} />);
    const btn = screen.getByRole('button', { name: 'Reduce units to 3' });
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ remainingAllowance: 3 }));
  });

  it('focuses the target element by id when onAction is not supplied', () => {
    renderIntl(
      <div>
        <input id="units" aria-label="Units" />
        <ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 316)} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reduce units' }));
    expect(document.activeElement).toBe(document.getElementById('units'));
  });

  it('renders translated labels in Nigerian Pidgin (pcm)', () => {
    const r1 = renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 310)} />, 'pcm');
    expect(screen.getByRole('link', { name: 'Check other pools' })).toBeInTheDocument();
    r1.unmount();

    const r2 = renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 315)} />, 'pcm');
    expect(screen.getByRole('button', { name: 'Reduce the units' })).toBeInTheDocument();
    r2.unmount();

    renderIntl(<ErrorExplainer error={new ApiError(400, 'INSUFFICIENT_BALANCE', 'x')} />, 'pcm');
    expect(screen.getByRole('button', { name: 'Add money with Naira' })).toBeInTheDocument();
  });

  it('falls back to generic message with no action for unknown errors', () => {
    renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 999)} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation: Tab reaches action, Enter and Space activate button', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 315)} onAction={onAction} />);

    await user.tab();
    const btn = screen.getByRole('button', { name: 'Reduce units' });
    expect(btn).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard navigation: Tab reaches link for route action', async () => {
    const user = userEvent.setup();
    renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 310)} onRetry={vi.fn()} />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'View other pools' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });

  it('passes axe accessibility checks for route action, in-page action, and fallback', async () => {
    const r1 = renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 310)} onRetry={vi.fn()} />);
    expect(await violations(r1.container)).toEqual([]);
    r1.unmount();

    const r2 = renderIntl(<ErrorExplainer error={new ApiError(422, 'CONTRACT_ERROR', 'x', 315)} onAction={vi.fn()} />);
    expect(await violations(r2.container)).toEqual([]);
    r2.unmount();

    const r3 = renderIntl(<ErrorExplainer error={new Error('unknown')} />);
    expect(await violations(r3.container)).toEqual([]);
  });
});
