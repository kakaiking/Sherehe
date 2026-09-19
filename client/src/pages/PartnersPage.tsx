import { useState, type FormEvent, type ReactElement } from "react";
import { api, type ApiError } from "../api";
import type { User } from "../App";
import { continuePath } from "../flow/continue";
import { ChoiceList, StepForm } from "../flow/StepForm";
import { useAuthGate } from "../flow/useAuthGate";
import { usePickStep } from "../flow/usePickStep";
import { useSnackbar } from "../snackbar";

const STEPS = [
  { id: "pick", title: "Partner or sponsor?" },
  { id: "details", title: "Registration details" },
] as const;

export function PartnersPage({ user }: { user: User | null }): ReactElement {
  const [memberCount, setMemberCount] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [website, setWebsite] = useState("");
  const [brandInfo, setBrandInfo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const gate = useAuthGate(user);
  const { show } = useSnackbar();
  const { step, pick, selectPick, goBack } = usePickStep(user);
  const kind = pick === "sponsor" ? "sponsor" : "partner";

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api("/v1/partners", {
        method: "POST",
        body: JSON.stringify({
          kind,
          memberCount,
          companyName,
          contactName,
          website: website || undefined,
          brandInfo,
        }),
      });
      show("Registration submitted. The event team will review it.");
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  function onChoose(next: "partner" | "sponsor"): void {
    gate(continuePath("/partners", next), () => {
      selectPick(next);
    });
  }

  return (
    <StepForm
      steps={STEPS}
      step={step}
      onBack={goBack}
      footer={
        step === 1 ? (
          <button type="submit" form="partner-reg">
            Submit registration
          </button>
        ) : undefined
      }
    >
      {step === 0 ? (
        <ChoiceList>
          <li>
            <button type="button" className="choice-card" onClick={() => onChoose("partner")}>
              <span>Official partner</span>
            </button>
          </li>
          <li>
            <button type="button" className="choice-card" onClick={() => onChoose("sponsor")}>
              <span>Sponsor</span>
            </button>
          </li>
        </ChoiceList>
      ) : (
        <form id="partner-reg" onSubmit={(e) => void submit(e)}>
          <label>
            Type
            <input readOnly value={kind === "sponsor" ? "Sponsor" : "Official partner"} />
          </label>
          <label>
            Members or representatives
            <input
              type="number"
              min={1}
              max={500}
              value={memberCount}
              onChange={(ev) => setMemberCount(Number(ev.target.value))}
            />
          </label>
          <label>
            Company or brand
            <input
              value={companyName}
              onChange={(ev) => setCompanyName(ev.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            Contact name
            <input
              value={contactName}
              onChange={(ev) => setContactName(ev.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            Website (optional)
            <input
              type="url"
              value={website}
              onChange={(ev) => setWebsite(ev.target.value)}
            />
          </label>
          <label>
            Brand information
            <textarea
              rows={5}
              value={brandInfo}
              onChange={(ev) => setBrandInfo(ev.target.value)}
              required
              maxLength={2000}
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </StepForm>
  );
}
