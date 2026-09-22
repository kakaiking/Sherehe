/** True when this Google email is the configured admin (staff) account. */
export function isStaffEmail(
  email: string,
  staffEmail: string | undefined,
): boolean {
  if (!staffEmail) return false;
  return email.trim().toLowerCase() === staffEmail.trim().toLowerCase();
}
