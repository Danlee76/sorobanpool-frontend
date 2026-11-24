'use client';
import { useRef, useState, useEffect, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import { formatNaira, groupDigits } from '@/lib/format';

export interface AmountInputProps {
  /** Current value in smallest unit (kobo) */
  value: bigint | null;
  /** Called when the value changes */
  onChange: (value: bigint | null) => void;
  /** Minimum allowed value in kobo */
  min?: bigint;
  /** Maximum allowed value in kobo */
  max?: bigint;
  /** Label for the input */
  label: string;
  /** ID for the input element */
  id: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Optional placeholder text */
  placeholder?: string;
}

/** Parse a string that may contain naira sign, commas, and spaces into a bigint (kobo). Returns null if invalid. */
function parseNaira(raw: string): bigint | null {
  // Remove naira sign, commas, and spaces
  const cleaned = raw.replace(/[₦,\s]/g, '');
  // Only digits allowed
  if (!/^\d*$/.test(cleaned)) return null;
  if (cleaned === '' || cleaned === '0') return 0n;
  // Remove leading zeros
  const trimmed = cleaned.replace(/^0+/, '') || '0';
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

/** Format a bigint (kobo) for display with grouping */
function formatForDisplay(value: bigint | null): string {
  if (value === null) return '';
  return groupDigits(value);
}

/**
 * Money input component with naira parsing and limits.
 * Handles pasting text with commas and naira sign, formats with grouping while typing,
 * enforces min/max, and returns a BigInt safely.
 */
export function AmountInput({ value, onChange, min, max, label, id, disabled, placeholder }: AmountInputProps) {
  const [displayValue, setDisplayValue] = useState(formatForDisplay(value));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Update display when value prop changes externally
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatForDisplay(value));
    }
  }, [value, isFocused]);

  const validate = (val: bigint | null): string | null => {
    if (val === null) return null;
    if (min !== undefined && val < min) {
      return `Minimum is ${formatNaira(min)}`;
    }
    if (max !== undefined && val > max) {
      return `Maximum is ${formatNaira(max)}`;
    }
    return null;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty input
    if (raw === '') {
      setDisplayValue('');
      setError(null);
      onChange(null);
      return;
    }

    const parsed = parseNaira(raw);
    if (parsed === null) {
      // Invalid input - don't update
      return;
    }

    // Update display with formatted value
    const formatted = groupDigits(parsed);
    setDisplayValue(formatted);
    
    // Validate and update
    const validationError = validate(parsed);
    setError(validationError);
    onChange(parsed);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const parsed = parseNaira(pasted);
    
    if (parsed !== null) {
      const formatted = groupDigits(parsed);
      setDisplayValue(formatted);
      const validationError = validate(parsed);
      setError(validationError);
      onChange(parsed);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, enter, arrows
    if ([8, 9, 27, 13, 46, 37, 38, 39, 40].includes(e.keyCode)) {
      return;
    }
    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].includes(e.keyCode)) {
      return;
    }
    // Ensure that it's a number
    if ((e.shiftKey || e.keyCode < 48 || e.keyCode > 57) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Reformat on blur
    if (value !== null) {
      setDisplayValue(formatForDisplay(value));
    }
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" aria-hidden="true">
          ₦
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 w-full rounded-lg border border-neutral-400 pl-8 pr-3 text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60"
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {min !== undefined && max !== undefined && !error && (
        <p className="text-xs text-neutral-600">
          Range: {formatNaira(min)} – {formatNaira(max)}
        </p>
      )}
    </div>
  );
}
