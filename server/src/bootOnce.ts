export type BootSlot<T> = { current?: Promise<T> };

/**
 * Remember a successful boot. A rejected start must not stick: Vercel
 * reuses the isolate, and a cached migrate failure would 500 every route.
 */
export async function resolveSingletonBoot<T>(
  slot: BootSlot<T>,
  start: () => Promise<T>,
): Promise<T> {
  if (!slot.current) slot.current = start();
  try {
    return await slot.current;
  } catch (err) {
    delete slot.current;
    throw err;
  }
}
