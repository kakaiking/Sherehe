import type { FlowStep } from "../../flow/StepForm";

export const SHOP_STEPS: readonly FlowStep[] = [
  { id: "stall", title: "Vendors" },
  { id: "pick", title: "Meals" },
  { id: "qty", title: "How many?" },
  { id: "pay", title: "Pay with M-Pesa" },
  { id: "stub", title: "Your receipt" },
];

export const SHOP_RECEIPT_STEP = SHOP_STEPS.length - 1;
