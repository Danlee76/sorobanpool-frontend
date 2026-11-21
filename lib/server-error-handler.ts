/**
 * Server Error Handler
 *
 * Translates API error responses to user-friendly messages.
 * Handles both error code lookups and fallback translations for server messages.
 */

import errorMessages from '@/messages/errors.en.json';

export interface ServerError {
  code?: string | number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface TranslatedError {
  what: string;
  todo: string;
  code?: string | number;
}

/**
 * Translates a server error to a user-friendly message.
 *
 * First tries to match by error code, then attempts to translate
 * the raw server message if code lookup fails.
 */
export function translateServerError(error: ServerError): TranslatedError {
  // Try to find error by code first
  if (error.code) {
    const codeStr = String(error.code);
    const found = errorMessages[codeStr as keyof typeof errorMessages];
    if (found) {
      return {
        what: found.what,
        todo: found.todo,
        code: error.code,
      };
    }
  }

  // If we have a raw message, provide a helpful fallback
  if (error.message) {
    return {
      what: error.message,
      todo: 'If this problem persists, please contact support.',
      code: error.code,
    };
  }

  // Ultimate fallback
  return {
    what: 'An unexpected error occurred.',
    todo: 'Please try again or contact support if the problem continues.',
    code: error.code,
  };
}

/**
 * Extracts error from various response formats.
 */
export function extractError(response: unknown): ServerError {
  if (!response) {
    return {};
  }

  if (typeof response === 'string') {
    return { message: response };
  }

  if (typeof response === 'object') {
    const obj = response as Record<string, unknown>;

    // Try common error response formats
    return {
      code: obj.code || obj.error_code || obj.errorCode,
      message: obj.message || obj.error || obj.msg,
      details: obj.details || obj.data,
    };
  }

  return {};
}

/**
 * Handles API error responses and returns translated message.
 * Can be used in try-catch blocks or error boundaries.
 */
export async function handleApiError(response: Response): Promise<TranslatedError> {
  let error: ServerError = {};

  try {
    const data = await response.json();
    error = extractError(data);
  } catch {
    // If JSON parsing fails, use status text
    error = {
      code: response.status,
      message: response.statusText,
    };
  }

  return translateServerError(error);
}

/**
 * Utility to format error message for display.
 */
export function formatErrorDisplay(error: TranslatedError): string {
  let message = error.what;
  if (error.todo) {
    message += ` ${error.todo}`;
  }
  return message;
}
