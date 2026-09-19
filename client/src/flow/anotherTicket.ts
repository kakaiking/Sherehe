/**
 * First-time STK can proceed. A second purchase needs an explicit continue.
 */
export function needsAnotherTicketConfirm(
  hasTicket: boolean,
  allowAnother: boolean,
): boolean {
  return hasTicket && !allowAnother;
}
