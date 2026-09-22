/** Fixed inventory pool: sum of ticket-type capacities must equal this. */
export const TICKET_CAPACITY_POOL = 300;

export function poolDeltaCopy(sum: number, pool: number = TICKET_CAPACITY_POOL): string {
  const delta = sum - pool;
  if (delta === 0) return "Pool balanced.";
  if (delta > 0) return `${delta} over.`;
  return `${-delta} short.`;
}

export function parseCapacityDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || String(n) !== trimmed) return null;
  if (n < 0) return null;
  return n;
}
