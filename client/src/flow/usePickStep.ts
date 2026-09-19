import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { User } from "../App";

/**
 * Shared step-1 pick → step-2 details. The chosen id lives in `?pick=` so
 * sign-in can return to the same offering. Changing the pick means going back.
 */
export function usePickStep(user: User | null): {
  step: number;
  pick: string;
  selectPick: (id: string) => void;
  goBack: () => void;
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
} {
  const [params, setParams] = useSearchParams();
  const urlPick = params.get("pick") ?? "";
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState("");

  useEffect(() => {
    if (!user || !urlPick) return;
    setPick(urlPick);
    setStep(1);
  }, [user, urlPick]);

  function goBack(): void {
    setStep(0);
    setPick("");
    const next = new URLSearchParams(params);
    next.delete("pick");
    setParams(next, { replace: true });
  }

  function selectPick(id: string): void {
    setPick(id);
    setStep(1);
    const next = new URLSearchParams(params);
    next.set("pick", id);
    setParams(next, { replace: true });
  }

  return { step, pick, selectPick, goBack, params, setParams };
}
