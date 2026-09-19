import type { FlowStep } from "../../flow/StepForm";

export const SHOP_STEPS: readonly FlowStep[] = [
  { id: "pick", title: "Pick a plate" },
  { id: "qty", title: "How many?" },
  { id: "pay", title: "Pay with M-Pesa" },
  { id: "stub", title: "Your receipt" },
];
