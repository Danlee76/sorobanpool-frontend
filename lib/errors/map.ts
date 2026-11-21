import errors from './errors.json';

export interface ErrorInfo {
  code: number;
  contract: string;
  name: string;
}

const byCode = new Map<number, ErrorInfo>((errors as ErrorInfo[]).map((e) => [e.code, e]));
export const knownErrorCodes: number[] = [...byCode.keys()];
export const errorInfo = (code: number): ErrorInfo | undefined => byCode.get(code);

/** Strictly allow-listed internal routes; error payloads can never supply arbitrary URLs. */
export const ALLOWED_ERROR_ROUTES = ['/explore', '/history', '/settings', '/supplier/bond'] as const;
export type AllowedErrorRoute = (typeof ALLOWED_ERROR_ROUTES)[number];

export function isAllowedErrorRoute(route: string): route is AllowedErrorRoute {
  return (ALLOWED_ERROR_ROUTES as readonly string[]).includes(route);
}

/** Discriminated union of allowable recovery actions for contract and API errors. */
export type ErrorAction =
  | { type: 'route'; route: AllowedErrorRoute; labelKey: string; params?: Record<string, string | number> }
  | {
      type: 'in-page';
      action: 'focus-units' | 'select-naira';
      labelKey: string;
      targetId?: string;
      remainingAllowance?: number;
      params?: Record<string, string | number>;
    }
  | { type: 'none' };

function readRemainingAllowance(context?: Record<string, unknown>): number | undefined {
  if (!context) return undefined;
  const raw = context.remainingAllowance;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  return undefined;
}

/** Maps a contract error code or known API error code to a safe recovery action. */
export function errorAction(code: number | string | undefined, context?: Record<string, unknown>): ErrorAction {
  if (code === undefined) return { type: 'none' };

  const c = typeof code === 'string' && /^\d+$/.test(code) ? Number(code) : code;

  // Pool closed, full of members, or not found -> browse other pools
  if (c === 310 || c === 319 || c === 308) {
    return { type: 'route', route: '/explore', labelKey: `errors.${c}.action` };
  }

  // Cap reached / over limits (315, 316, 317) -> reduce units (with remaining allowance when known)
  if (c === 315 || c === 316 || c === 317) {
    const allowance = readRemainingAllowance(context);
    if (allowance !== undefined) {
      return {
        type: 'in-page',
        action: 'focus-units',
        labelKey: 'errors.actions.reduceUnitsTo',
        targetId: 'units',
        remainingAllowance: allowance,
        params: { count: allowance },
      };
    }
    return { type: 'in-page', action: 'focus-units', labelKey: `errors.${c}.action`, targetId: 'units' };
  }

  // Account tier cap (318), zero units (312), or already committed (320) -> focus units control
  if (c === 318 || c === 312 || c === 320) {
    return { type: 'in-page', action: 'focus-units', labelKey: `errors.${c}.action`, targetId: 'units' };
  }

  // Nothing to claim on refund (339) -> view history
  if (c === 339) {
    return { type: 'route', route: '/history', labelKey: 'errors.339.action' };
  }

  // Supplier free bond too low (501) -> top up supplier bond
  if (c === 501) {
    return { type: 'route', route: '/supplier/bond', labelKey: 'errors.501.action' };
  }

  // Not enough balance (returned by API / Stellar SAC check, not a custom SorobanPool contract code)
  if (c === 'INSUFFICIENT_BALANCE' || c === 'NOT_ENOUGH_BALANCE' || c === 'insufficient_balance') {
    return { type: 'in-page', action: 'select-naira', labelKey: 'errors.actions.topUpNaira', targetId: 'naira-deposit' };
  }

  return { type: 'none' };
}

/** i18n keys and recovery action for a contract error; unknown codes fall back to a generic message with no action. */
export function errorKeys(code: number | undefined): { what: string; todo: string; action: ErrorAction } {
  const isKnown = code !== undefined && byCode.has(code);
  const action = isKnown ? errorAction(code) : { type: 'none' as const };
  return isKnown
    ? { what: `errors.${code}.what`, todo: `errors.${code}.todo`, action }
    : { what: 'errors.generic.what', todo: 'errors.generic.todo', action: { type: 'none' } };
}
