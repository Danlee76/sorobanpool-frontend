/**
 * Web Vitals reporter that posts metrics to the backend for real-user monitoring.
 * Reports LCP, INP, and CLS to help understand performance on low-end devices.
 * Sampling is configurable and failures are silent to avoid impacting user experience.
 */

export interface VitalsConfig {
  /** Endpoint to send metrics to. Defaults to /v1/vitals */
  endpoint?: string;
  /** Sample rate (0-1). Only this fraction of pageviews will report. Defaults to 0.05 (5%). */
  sampleRate?: number;
  /** Whether to report. Can be disabled via env var. Defaults to true in production. */
  enabled?: boolean;
}

interface Metric {
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

const DEFAULT_CONFIG: Required<VitalsConfig> = {
  endpoint: '/v1/vitals',
  sampleRate: 0.05,
  enabled: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_VITALS_ENABLED !== 'false',
};

let config: Required<VitalsConfig> = DEFAULT_CONFIG;
let shouldReport = false;

/**
 * Initialize the vitals reporter with configuration.
 * Must be called before reportWebVitals is used.
 */
export function initVitals(userConfig: VitalsConfig = {}): void {
  config = { ...DEFAULT_CONFIG, ...userConfig };
  
  if (!config.enabled) {
    shouldReport = false;
    return;
  }

  // Determine if this session should report based on sample rate
  shouldReport = Math.random() < config.sampleRate;
}

/**
 * Report a web vitals metric to the backend.
 * Uses sendBeacon for reliability (fire-and-forget, survives page unload).
 * No personal data is included in the payload.
 */
export function reportWebVitals(metric: Metric): void {
  if (!shouldReport || !config.enabled) return;

  // Check if sendBeacon is available
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
    return;
  }

  try {
    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
      // Include basic context but no identifiers
      url: window.location.pathname, // path only, no query params
      connection: getConnectionType(),
      timestamp: Date.now(),
    });

    const blob = new Blob([body], { type: 'application/json' });
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    navigator.sendBeacon(`${apiUrl}${config.endpoint}`, blob);
  } catch (e) {
    // Silent failure: vitals reporting should never impact the user experience
    if (process.env.NODE_ENV === 'development') {
      console.debug('Vitals reporting failed:', e);
    }
  }
}

/**
 * Get connection type without exposing personal data.
 */
function getConnectionType(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  
  // @ts-expect-error - navigator.connection is not in all browsers
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  if (!conn) return undefined;
  
  // Only report effective type (slow-2g, 2g, 3g, 4g) without details
  return conn.effectiveType;
}

/**
 * Next.js web vitals callback that integrates with our reporter.
 * Use this in app/layout.tsx or _app.tsx.
 */
export function onWebVitals(metric: Metric): void {
  // Only report the Core Web Vitals that matter for real-user performance
  if (['LCP', 'INP', 'CLS'].includes(metric.name)) {
    reportWebVitals(metric);
  }
  
  // Log in development for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Vitals] ${metric.name}:`, Math.round(metric.value), metric.rating);
  }
}
