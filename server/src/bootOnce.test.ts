import { describe, expect, it } from "vitest";
import { resolveSingletonBoot, type BootSlot } from "./bootOnce.js";

describe("resolveSingletonBoot", () => {
  it("reuses a successful start", async () => {
    const slot: BootSlot<number> = {};
    let starts = 0;
    const start = async (): Promise<number> => {
      starts += 1;
      return 1;
    };
    expect(await resolveSingletonBoot(slot, start)).toBe(1);
    expect(await resolveSingletonBoot(slot, start)).toBe(1);
    expect(starts).toBe(1);
  });

  it("retries after a failed start so a migrate crash cannot pin-kill the isolate", async () => {
    const slot: BootSlot<string> = {};
    let starts = 0;
    const start = async (): Promise<string> => {
      starts += 1;
      if (starts === 1) throw new Error("migrate");
      return "ok";
    };
    await expect(resolveSingletonBoot(slot, start)).rejects.toThrow(/migrate/);
    expect(await resolveSingletonBoot(slot, start)).toBe("ok");
    expect(starts).toBe(2);
  });
});
