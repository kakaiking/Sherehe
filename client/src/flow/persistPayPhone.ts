import { api } from "../api";
import type { User } from "../App";
import { SESSION_UID, queryKeys, writeQuery } from "../cache/queryCache";
import {
  extractKenyanNationalDigits,
  kenyanPhonePayload,
} from "../phone";

/**
 * Store the number this prompt should hit. Skip the write when the
 * account already has the same Kenyan national digits.
 */
export async function persistPayPhone(
  national: string,
  savedPhone: string | null | undefined,
  onAuth: (user: User) => void,
): Promise<void> {
  if (
    savedPhone &&
    extractKenyanNationalDigits(savedPhone) ===
      extractKenyanNationalDigits(national)
  ) {
    return;
  }
  const user = await api<User>("/v1/auth/phone", {
    method: "POST",
    body: JSON.stringify({ phone: kenyanPhonePayload(national) }),
  });
  onAuth(user);
  writeQuery(SESSION_UID, queryKeys.me, user);
}
