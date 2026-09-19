import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../api";
import type { User } from "../App";
import { ChoiceSkeleton } from "../cache/Skeleton";
import { PUBLIC_UID, queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
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

type Offering = {
  slug: string;
  name: string;
  category: string;
  description: string;
  price_ksh: number;
};

const STEPS = [
  { id: "pick", title: "Pick a service" },
  { id: "details", title: "Booking details" },
] as const;

export function ServicesPage({
  user,
  onAuth = () => undefined,
}: {
  user: User | null;
  onAuth?: (user: User) => void;
}): ReactElement {
  const { data, loading } = useApiQuery<{ offerings: Offering[] }>(
    queryKeys.services,
    "/v1/commerce/services",
    { uid: PUBLIC_UID },
  );
  const offerings = data?.offerings ?? [];
  const [eventDate, setEventDate] = useState("");
  const [pax, setPax] = useState(20);
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

  const selected = offerings.find((o) => o.slug === pick);

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
      const res = await api<{ orderId: string }>("/v1/commerce/services/book", {
        method: "POST",
        body: JSON.stringify({ slug: selected.slug, eventDate, pax, notes }),
      });
      show("Booking started. Approve M-Pesa on your phone.");
      void navigate(`/orders/${res.orderId}`);
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  function onChoose(o: Offering): void {
    gate(continuePath("/services", o.slug), () => {
      selectPick(o.slug);
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
            form="service-book"
            disabled={!selected || !isCompleteKenyanNational(phone)}
          >
            Book and pay with M-Pesa
          </button>
        ) : undefined
      }
    >
      {step === 0 ? (
        loading && offerings.length === 0 ? (
          <ChoiceSkeleton label="Loading services" />
        ) : (
        <ChoiceList>
          {offerings.map((o) => (
            <li key={o.slug}>
              <button type="button" className="choice-card stacked" onClick={() => onChoose(o)}>
                <span className="choice-copy">
                  <strong>
                    {o.name} · {o.category}
                  </strong>
                  <span>{o.description}</span>
                </span>
                <span className="price">{formatKsh(o.price_ksh)}</span>
              </button>
            </li>
          ))}
        </ChoiceList>
        )
      ) : (
        <form id="service-book" onSubmit={(e) => void submit(e)}>
          <label>
            Service
            <input readOnly value={selected?.name ?? pick} />
          </label>
          <label>
            Event date
            <input
              type="date"
              value={eventDate}
              onChange={(ev) => setEventDate(ev.target.value)}
              required
            />
          </label>
          <label>
            Guests
            <input
              type="number"
              min={1}
              value={pax}
              onChange={(ev) => setPax(Number(ev.target.value))}
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              required
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
