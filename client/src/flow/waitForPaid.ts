import { api } from "../api";

/** Poll STK Query until Daraja (or mock) settles the order. */
export async function waitForPaid(orderId: string): Promise<"paid" | "failed"> {
  for (let i = 0; i < 40; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 2000);
      });
    }
    try {
      const queried = await api<{ status: string }>(
        `/v1/orders/${orderId}/stk-query`,
        { method: "POST" },
      );
      if (queried.status === "paid") return "paid";
      if (queried.status === "failed") return "failed";
    } catch {
      const order = await api<{ status: string }>(`/v1/orders/${orderId}`);
      if (order.status === "paid") return "paid";
      if (order.status === "cancelled" || order.status === "expired") {
        return "failed";
      }
    }
  }
  return "failed";
}
