/** Split a trailing "(…)" detail onto its own line, e.g. Group Ticket / (5 people). */
export function splitOfferingName(name: string): {
  title: string;
  note: string | null;
} {
  const m = /^(.*?)\s+(\([^)]+\))$/.exec(name);
  if (!m) return { title: name, note: null };
  return { title: m[1] ?? name, note: m[2] ?? null };
}
