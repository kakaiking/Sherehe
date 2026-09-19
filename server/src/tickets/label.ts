/** Guest-facing ticket names. */
const LABELS: Record<string, string> = {
  early_bird: "Early Bird",
  rush: "Rush",
  regular: "Regular",
  vip: "VIP",
  viip: "VIIP",
  group: "Group",
  flash: "Flash",
};

export function ticketLabel(code: string): string {
  return LABELS[code] ?? code.replaceAll("_", " ");
}
