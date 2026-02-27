export type Currency = 'NGN' | 'USD';

export const USD_PRICES = {
  starter:  { monthly: 19,  annual: 190 },
  business: { monthly: 49,  annual: 490 },
} as const;

/** Returns annual savings as a percentage (e.g. 17 for "save 17%") */
export function annualSavingsPct(monthly: number, annual: number): number {
  return Math.round(((monthly * 12 - annual) / (monthly * 12)) * 100);
}
