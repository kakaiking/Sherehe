import type { FlowStep } from "./StepForm";

export const TICKET_STEPS: readonly FlowStep[] = [
  { id: "pick", title: "Pick a ticket" },
  { id: "qty", title: "How many?" },
  { id: "pay", title: "Pay with M-Pesa" },
  { id: "stub", title: "Your tickets" },
];
