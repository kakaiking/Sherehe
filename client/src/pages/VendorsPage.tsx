import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../api";
import type { User } from "../App";
import { ChoiceSkeleton } from "../cache/Skeleton";
import { PUBLIC_UID, queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { formatPurchaseWhen } from "../datetime";
import { continuePath } from "../flow/continue";
import { persistPayPhone } from "../flow/persistPayPhone";
import { ChoiceList, StepForm } from "../flow/StepForm";
import { useAuthGate } from "../flow/useAuthGate";
import { usePickStep } from "../flow/usePickStep";
import { KenyanPhoneField } from "../KenyanPhoneField";
import {
  extractKenyanNationalDigits,
  isCompleteKenyanNational,
} from "../phone";
import { useSnackbar } from "../snackbar";

type Pkg = {
  code: string;
  name: string;
  category_hint: string;
  space_description: string;
  fee_ksh: number;
  setup_time: string;
  operating_hours: string;
  payment_deadline: string;
  rules: string;
};

const STEPS = [
  { id: "pick", title: "Pick a package" },
  { id: "details", title: "Your stall" },
] as const;

/** One labeled row (or column at 480px+) on a stall package card. */
function StallFact({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <span className="stall-fact">
      <span className="stall-fact-label">{label}</span>
      <span className="stall-fact-value">{value}</span>
    </span>
  );
}

export function VendorsPage({
  user,
  onAuth = () => undefined,
}: {
  user: User | null;
  onAuth?: (user: User) => void;
}): ReactElement {
  const { data, loading } = useApiQuery<{ packages: Pkg[] }>(
    queryKeys.vendors,
    "/v1/vendors/packages",
    { uid: PUBLIC_UID },
  );
  const packages = data?.packages ?? null;
  const [category, setCategory] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState(() =>
    extractKenyanNationalDigits(user?.phone ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const gate = useAuthGate(user);
  const { step, pick, selectPick, goBack } = usePickStep(user);

  useEffect(() => {
    if (!user?.phone) return;
    setPhone(extractKenyanNationalDigits(user.phone));
  }, [user?.phone]);

  const selected = packages?.find((p) => p.code === pick);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!selected) return;
    if (!isCompleteKenyanNational(phone)) {
      setError("Enter the nine digits after +254.");
      return;
    }
    setError(null);
    try {
      await persistPayPhone(phone, user?.phone, onAuth);
      const res = await api<{ orderId: string }>("/v1/vendors/apply", {
        method: "POST",
        body: JSON.stringify({
          packageCode: selected.code,
          category,
          companyName,
          notes,
        }),
      });
      show("Application started. Approve M-Pesa on your phone.");
      void navigate(`/orders/${res.orderId}`);
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  function onChoose(p: Pkg): void {
    gate(continuePath("/vendors", p.code), () => {
      selectPick(p.code);
    });
  }

  return (
    <StepForm
      steps={STEPS}
      step={step}
      onBack={goBack}
      footer={
        step === 1 ? (
          <button
            type="submit"
            form="vendor-apply"
            disabled={!selected || !isCompleteKenyanNational(phone)}
          >
            Apply and pay with M-Pesa
          </button>
        ) : undefined
      }
    >
      {step === 0 ? (
        loading && packages === null ? (
          <ChoiceSkeleton count={3} label="Loading stall packages" />
        ) : packages === null || packages.length === 0 ? (
          <p className="status">No stall packages are listed yet.</p>
        ) : (
          <ChoiceList>
            {packages.map((p) => (
              <li key={p.code}>
                <button
                  type="button"
                  className="choice-card stall-pitch"
                  onClick={() => onChoose(p)}
                >
                  <span className="stall-pitch-head">
                    <span className="choice-copy">
                      <span className="stall-pitch-kind">{p.category_hint}</span>
                      <strong>{p.name}</strong>
                    </span>
                    <span className="price">{formatKsh(p.fee_ksh)}</span>
                  </span>
                  <span className="stall-pitch-space">{p.space_description}</span>
                  <span className="stall-facts">
                    <StallFact label="Set-up" value={p.setup_time} />
                    <StallFact label="Hours" value={p.operating_hours} />
                    <StallFact
                      label="Pay by"
                      value={formatPurchaseWhen(p.payment_deadline)}
                    />
                  </span>
                  <span className="stall-pitch-rules">{p.rules}</span>
                </button>
              </li>
            ))}
          </ChoiceList>
        )
      ) : (
        <form id="vendor-apply" onSubmit={(e) => void submit(e)}>
          <label>
            Package
            <input readOnly value={selected?.name ?? pick} />
          </label>
          <label>
            Vendor category
            <input
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
              required
              placeholder={selected?.category_hint}
              maxLength={80}
            />
          </label>
          <label>
            Company
            <input
              value={companyName}
              onChange={(ev) => setCompanyName(ev.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              required
              maxLength={2000}
            />
          </label>
          <KenyanPhoneField
            label="M-Pesa number"
            value={phone}
            onChange={setPhone}
          />
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
