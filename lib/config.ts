// Single place for the product name so a rename is a one-line change (brief 1.5).
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "SorobanPool";
export const TAGLINE = "Built on Stellar";

/** Minutes of inactivity before an admin or arbiter session ends. */
export const STAFF_IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_STAFF_IDLE_MINUTES ?? 15) || 15;

/** Web vitals reporting configuration */
export const VITALS_SAMPLE_RATE = Number(process.env.NEXT_PUBLIC_VITALS_SAMPLE_RATE ?? 0.05);
export const VITALS_ENABLED = process.env.NEXT_PUBLIC_VITALS_ENABLED !== 'false';
