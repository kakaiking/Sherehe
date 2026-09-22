import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../api";
import { ChoiceSkeleton } from "../cache/Skeleton";
import { markStale, PUBLIC_UID, queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import type { User } from "../App";
import { needsAnotherTicketConfirm } from "../flow/anotherTicket";
import { ConfirmModal } from "../flow/ConfirmModal";
import { continuePath } from "../flow/continue";
import { persistPayPhone } from "../flow/persistPayPhone";
import { ChoiceList, StepForm } from "../flow/StepForm";
import { TICKET_STEPS } from "../flow/ticketSteps";
import { useAuthGate } from "../flow/useAuthGate";
import { usePickStep } from "../flow/usePickStep";
import { waitForPaid } from "../flow/waitForPaid";
import { KenyanPhoneField } from "../KenyanPhoneField";
import {
  extractKenyanNationalDigits,
  formatKenyanMsisdnDisplay,
  isCompleteKenyanNational,
} from "../phone";
import { QuantityField } from "../QuantityField";
import { useSnackbar } from "../snackbar";

type Offering = {
  code: string;
  name: string;
  priceKsh: number;
  seatsPerUnit: number;
  remainingUnits: number;
};

/** Guest portal ticket purchase flow. */
export function TicketsPage({
  user,
  onAuth = () => undefined,
}: {
  user: User | null;
  onAuth?: (user: User) => void;
}): ReactElement {
  const { data, loading, error: loadError } = useApiQuery<{ offerings: Offering[] }>(
    queryKeys.tickets,
    "/v1/catalog/tickets",
    { uid: PUBLIC_UID },
  );
  const offerings = data?.offerings ?? [];
  const [qty, setQty] = useState(1);
  const [phone, setPhone] = useState(() =>
    extractKenyanNationalDigits(user?.phone ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [onPay, setOnPay] = useState(false);
  const [askAnother, setAskAnother] = useState(false);
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const gate = useAuthGate(user);
  const { step: pickStep, pick, selectPick, goBack: backToPick } = usePickStep(
    user,
  );

  useEffect(() => {
    if (pickStep === 0) {
      setOnPay(false);
      setWaiting(false);
    }
  }, [pickStep]);

  useEffect(() => {
    if (!user?.phone) return;
    setPhone(extractKenyanNationalDigits(user.phone));
  }, [user?.phone]);

  const selected = offerings.find((o) => o.code === pick);
  const step = onPay ? 2 : pickStep;
  const phoneLabel = isCompleteKenyanNational(phone)
    ? formatKenyanMsisdnDisplay(phone)
    : null;
  const totalKsh = selected ? selected.priceKsh * qty : 0;

  function goBack(): void {
    if (waiting) return;
    if (onPay) {
      setOnPay(false);
      setAskAnother(false);
      setError(null);
      return;
    }
    backToPick();
  }

  function toPay(e: React.FormEvent): void {
    e.preventDefault();
    if (!selected) {
      setError("Pick a ticket first.");
      return;
    }
    setError(null);
    setOnPay(true);
  }

  /**
   * Send the M-Pesa STK. If this account already downloaded a stub, show a
   * confirm dialog first unless `allowAnother` is set from Continue.
   */
  async function sendPrompt(allowAnother = false): Promise<void> {
    if (!selected) {
      setError("Pick a ticket first.");
      return;
    }
    if (!isCompleteKenyanNational(phone)) {
      setError("Enter the nine digits after +254.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!allowAnother) {
        const pass = await api<{ hasTicket: boolean }>("/v1/account/ticket-pass");
        if (needsAnotherTicketConfirm(pass.hasTicket, allowAnother)) {
          setAskAnother(true);
          return;
        }
      }
      await persistPayPhone(phone, user?.phone, onAuth);
      const order = await api<{ orderId: string }>("/v1/orders/tickets", {
        method: "POST",
        body: JSON.stringify({ code: selected.code, qty }),
      });
      markStale(PUBLIC_UID, queryKeys.tickets);
      if (user) markStale(user.id, queryKeys.accountOrders);
      setWaiting(true);
      show("Ticket order started. Approve M-Pesa on your phone.");
      const outcome = await waitForPaid(order.orderId);
      if (outcome === "paid") {
        void navigate(`/guest/orders/${order.orderId}`);
        return;
      }
      setWaiting(false);
      setError("M-Pesa did not complete. Check your phone and try again.");
    } catch (err) {
      setWaiting(false);
      setError((err as ApiError).detail);
    } finally {
      setBusy(false);
    }
  }

  function onChoose(o: Offering): void {
    gate(continuePath("/guest/tickets", o.code), () => {
      selectPick(o.code);
    });
  }

  const payReady = Boolean(selected) && Boolean(phoneLabel) && !busy;

  return (
    <StepForm
      steps={TICKET_STEPS}
      step={step}
      {...(waiting ? {} : { onBack: goBack })}
      footer={
        step === 1 ? (
          <button type="submit" form="ticket-qty" disabled={!selected}>
            Pay
          </button>
        ) : step === 2 ? (
          <button type="submit" form="ticket-pay" disabled={!payReady || waiting}>
            {waiting ? "Waiting for M-Pesa…" : "Receive Prompt"}
          </button>
        ) : undefined
      }
    >
      {loadError ? (
        <p className="error" role="alert">
          {loadError}
        </p>
      ) : null}
      {step === 0 ? (
        loading && offerings.length === 0 ? (
          <ChoiceSkeleton label="Loading tickets" />
        ) : offerings.length === 0 && !loadError ? (
          <p className="status">
            No tickets are on sale at this hour. Check back when the coals are
            lit.
          </p>
        ) : (
          <ChoiceList>
            {offerings.map((o) => (
              <li key={o.code}>
                <button type="button" className="choice-card" onClick={() => onChoose(o)}>
                  <span>{o.name}</span>
                  <span className="price">{formatKsh(o.priceKsh)}</span>
                </button>
              </li>
            ))}
          </ChoiceList>
        )
      ) : step === 1 ? (
        <form id="ticket-qty" onSubmit={toPay}>
          <label>
            Ticket
            <input readOnly value={selected ? selected.name : pick} />
          </label>
          <QuantityField value={qty} onChange={setQty} />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <form
          id="ticket-pay"
          onSubmit={(e) => {
            e.preventDefault();
            void sendPrompt(false);
          }}
        >
          <p className="pick-summary">
            {selected ? `${selected.name} × ${qty}` : pick}
          </p>
          <label>
            Amount
            <input readOnly value={formatKsh(totalKsh)} />
          </label>
          <KenyanPhoneField
            label="M-Pesa number"
            value={phone}
            onChange={setPhone}
            disabled={waiting}
          />
          {waiting ? (
            <p className="status" role="status">
              Approve the M-Pesa prompt on {phoneLabel}. This page waits for
              Daraja to confirm.
            </p>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
      {askAnother ? (
        <ConfirmModal
          title="Are you sure you want another ticket?"
          body="You already downloaded a paid stub. Continue to send a new M-Pesa prompt."
          confirmLabel="Continue"
          onConfirm={() => {
            setAskAnother(false);
            void sendPrompt(true);
          }}
          onDismiss={() => setAskAnother(false)}
        />
      ) : null}
    </StepForm>
  );
}
