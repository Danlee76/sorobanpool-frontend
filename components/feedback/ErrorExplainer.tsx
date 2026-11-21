'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';
import { errorAction, errorKeys, isAllowedErrorRoute, type ErrorAction } from '@/lib/errors/map';
import { UserDeclined } from '@/lib/tx';
import { UnsafeTransaction } from '@/lib/verify';

export interface ExplainedError {
  what: string;
  todo: string;
  action: ErrorAction;
}

/** Turns any failure into "what happened", "what to do now", and an optional recovery action. Never shows codes or stack traces. */
export function explain(e: unknown): ExplainedError {
  if (e instanceof Error && e.message === 'STORAGE_WARNING') {
    return { what: 'errors.STORAGE_WARNING.what', todo: 'errors.STORAGE_WARNING.todo', action: { type: 'none' } };
  }
  if (e instanceof UnsafeTransaction) {
    return { what: 'errors.unsafe.what', todo: 'errors.unsafe.todo', action: { type: 'none' } };
  }
  if (e instanceof UserDeclined) {
    return { what: 'errors.declined.what', todo: 'errors.declined.todo', action: { type: 'none' } };
  }
  if (e instanceof ApiError) {
    const ctx = e as unknown as Record<string, unknown>;
    if (e.contractCode !== undefined) {
      const keys = errorKeys(e.contractCode);
      const action = keys.what === 'errors.generic.what' ? { type: 'none' as const } : errorAction(e.contractCode, ctx);
      return { what: keys.what, todo: keys.todo, action };
    }
    const action = errorAction(e.code, ctx);
    const specific = ['OTP_WRONG', 'OTP_EXPIRED', 'OTP_LOCKED', 'OTP_RATE_LIMITED', 'INVALID_PHONE', 'FEE_TOO_HIGH', 'IMAGE_INVALID', 'INSUFFICIENT_BALANCE'];
    if (specific.includes(e.code)) {
      return { what: `errors.${e.code}.what`, todo: `errors.${e.code}.todo`, action };
    }
    if (e.code === 'NOT_ENOUGH_BALANCE' || e.code === 'insufficient_balance') {
      return { what: 'errors.INSUFFICIENT_BALANCE.what', todo: 'errors.INSUFFICIENT_BALANCE.todo', action };
    }
  }
  if (e instanceof TypeError) {
    return { what: 'errors.network.what', todo: 'errors.network.todo', action: { type: 'none' } };
  }
  return { what: 'errors.generic.what', todo: 'errors.generic.todo', action: { type: 'none' } };
}

export function ErrorExplainer({
  error,
  onRetry,
  onAction,
}: {
  error: unknown;
  onRetry?: () => void;
  onAction?: (action: ErrorAction) => void;
}) {
  const t = useTranslations();
  const { what, todo, action } = explain(error);

  const handleInPageAction = (act: Extract<ErrorAction, { type: 'in-page' }>) => {
    if (onAction) {
      onAction(act);
      return;
    }
    if (act.targetId) {
      document.getElementById(act.targetId)?.focus();
    }
  };

  const hasAction =
    (action.type === 'route' && isAllowedErrorRoute(action.route)) || action.type === 'in-page';

  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      <p className="font-semibold">{t(what)}</p>
      <p className="mt-1 text-sm">{t(todo)}</p>
      {(hasAction || onRetry) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {action.type === 'route' && isAllowedErrorRoute(action.route) && (
            <Link
              href={action.route}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            >
              {t(action.labelKey, action.params)}
            </Link>
          )}
          {action.type === 'in-page' && (
            <button
              type="button"
              onClick={() => handleInPageAction(action)}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            >
              {t(action.labelKey, action.params)}
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-12 rounded-lg border border-red-700 px-4 font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
