'use client';
import { useRef, useState, useEffect, useCallback, type ChangeEvent, type KeyboardEvent } from 'react';

export interface UnitsStepperProps {
  /** Current value */
  value: number;
  /** Called when value changes */
  onChange: (value: number) => void;
  /** Minimum allowed value */
  min: number;
  /** Maximum allowed value */
  max: number;
  /** Label for the stepper */
  label: string;
  /** ID for the input element */
  id: string;
  /** Whether the stepper is disabled */
  disabled?: boolean;
  /** Optional help text explaining the limits */
  helpText?: string;
}

const LONG_PRESS_THRESHOLD = 500; // ms before acceleration starts
const REPEAT_INTERVAL = 100; // ms between repeats
const ACCELERATION_INTERVAL = 50; // ms between fast repeats after acceleration

/**
 * Units stepper with large buttons, long-press repeat with acceleration,
 * direct entry, and clear limit enforcement.
 */
export function UnitsStepper({ value, onChange, min, max, label, id, disabled, helpText }: UnitsStepperProps) {
  const [displayValue, setDisplayValue] = useState(String(value));
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const repeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAcceleratedRef = useRef(false);
  const directionRef = useRef<'increment' | 'decrement' | null>(null);

  // Update display when value prop changes externally
  useEffect(() => {
    setDisplayValue(String(value));
  }, [value]);

  const clamp = useCallback((val: number) => Math.max(min, Math.min(max, val)), [min, max]);

  const increment = useCallback(() => {
    onChange(clamp(value + 1));
  }, [value, onChange, clamp]);

  const decrement = useCallback(() => {
    onChange(clamp(value - 1));
  }, [value, onChange, clamp]);

  const clearTimers = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    isAcceleratedRef.current = false;
    directionRef.current = null;
  };

  const startRepeat = (direction: 'increment' | 'decrement') => {
    const action = direction === 'increment' ? increment : decrement;
    
    // First action happens immediately
    action();
    
    // Start long press timer for acceleration
    longPressTimerRef.current = setTimeout(() => {
      isAcceleratedRef.current = true;
      // Switch to faster interval
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
      }
      repeatTimerRef.current = setInterval(action, ACCELERATION_INTERVAL);
    }, LONG_PRESS_THRESHOLD);
    
    // Start regular repeat
    repeatTimerRef.current = setInterval(action, REPEAT_INTERVAL);
    
    directionRef.current = direction;
  };

  const handleMouseDown = (direction: 'increment' | 'decrement') => {
    if (disabled) return;
    startRepeat(direction);
  };

  const handleMouseUp = () => {
    clearTimers();
  };

  const handleTouchStart = (direction: 'increment' | 'decrement') => {
    if (disabled) return;
    startRepeat(direction);
  };

  const handleTouchEnd = () => {
    clearTimers();
  };

  // Clean up on unmount
  useEffect(() => {
    return () => clearTimers();
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    
    // Parse as number
    const parsed = parseInt(raw.replace(/\D/g, ''), 10);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    } else if (raw === '') {
      // Allow empty temporarily
      setDisplayValue('');
    }
  };

  const handleInputBlur = () => {
    // Restore valid value on blur
    if (displayValue === '' || isNaN(parseInt(displayValue, 10))) {
      setDisplayValue(String(value));
    } else {
      const parsed = parseInt(displayValue, 10);
      const clamped = clamp(parsed);
      setDisplayValue(String(clamped));
      if (clamped !== value) {
        onChange(clamped);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      increment();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      decrement();
    }
  };

  const canDecrement = value > min && !disabled;
  const canIncrement = value < max && !disabled;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease units"
          disabled={!canDecrement}
          onMouseDown={() => handleMouseDown('decrement')}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={() => handleTouchStart('decrement')}
          onTouchEnd={handleTouchEnd}
          className="size-12 min-h-[48px] min-w-[48px] rounded-lg border-2 border-neutral-400 text-2xl font-bold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-40 disabled:hover:bg-transparent active:bg-neutral-100"
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="h-12 w-24 rounded-lg border-2 border-neutral-400 text-center text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Increase units"
          disabled={!canIncrement}
          onMouseDown={() => handleMouseDown('increment')}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={() => handleTouchStart('increment')}
          onTouchEnd={handleTouchEnd}
          className="size-12 min-h-[48px] min-w-[48px] rounded-lg border-2 border-neutral-400 text-2xl font-bold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-40 disabled:hover:bg-transparent active:bg-neutral-100"
        >
          +
        </button>
      </div>
      <div className="text-sm text-neutral-700">
        {helpText && <p>{helpText}</p>}
        <p>
          Limits: {min.toLocaleString()} – {max.toLocaleString()} units
          {value >= max && <span className="ml-2 font-semibold text-amber-700">Maximum reached</span>}
          {value <= min && value === max && <span className="ml-2 font-semibold">Only {max} available</span>}
        </p>
      </div>
    </div>
  );
}
