'use client';
import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { onWebVitals } from '@/lib/vitals';

/**
 * Client component that reports Web Vitals to the backend.
 * Uses Next.js's built-in web vitals hook.
 */
export function VitalsReporter() {
  useReportWebVitals((metric) => {
    onWebVitals(metric);
  });

  return null;
}
