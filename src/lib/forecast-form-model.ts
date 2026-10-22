import type { ForecastInput } from './forecast-model';
export const ROUND_OPTIONS = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E', 'Bridge', 'Growth', 'Custom'];
export function forecastYears(currentYear: number, selected: number[] = []) {
  return [...new Set([...Array.from({ length: 31 }, (_, i) => currentYear + i), ...selected])].filter(y => y >= 1900 && y <= 2200).sort((a, b) => a - b);
}
export const dollarsToCents = (value: string) => value.trim() ? Math.round(Number(value) * 100) : 0;
export const percentToRate = (value: string) => value.trim() ? Number(value) / 100 : 0;
export function newRound(): Extract<ForecastInput, { model: 'cap_table' }>['rounds'][number] {
  return { name: 'Seed', preMoney: 100000000, raised: 0, poolPercent: 0, conversions: [] };
}
export function selectHolding(holders: Extract<ForecastInput, { model: 'cap_table' }>['holders'], index: number, holding: { holder: string; class: string; shares: number }) {
  return holders.map((h, i) => i === index ? { ...holding } : h);
}