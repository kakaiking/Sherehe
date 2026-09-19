/** Structured JSON logs. Never pass secrets, tokens, or PII in `fields`. */
export function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, string | number | boolean | null> = {},
): void {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields })}\n`,
  );
}
