import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../../api";
import type { User } from "../../App";
import { continuePath } from "../../flow/continue";
import { persistPayPhone } from "../../flow/persistPayPhone";
import { StepForm } from "../../flow/StepForm";
import { useAuthGate } from "../../flow/useAuthGate";
import { usePickStep } from "../../flow/usePickStep";
import { waitForPaid } from "../../flow/waitForPaid";
import { KenyanPhoneField } from "../../KenyanPhoneField";
import {
  extractKenyanNationalDigits,
  formatKenyanMsisdnDisplay,
  isCompleteKenyanNational,
} from "../../phone";
import { QuantityField } from "../../QuantityField";
import { useSnackbar } from "../../snackbar";
import { SHOP_STEPS } from "./shopSteps";

export type ShopProduct = {
  slug: string;
  name: string;
  description: string;
  price_ksh: number;
  stock: number;
};

export function GuestShop({
  user,
  onAuth = () => undefined,
}: {
  user: User | null;
  onAuth?: (user: User) => void;
}): ReactElement {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [pages, setPages] = useState(1);
  const [qty, setQty] = useState(1);
  const [phone, setPhone] = useState(() =>
    extractKenyanNationalDigits(user?.phone ?? ""),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [onPay, setOnPay] = useState(false);
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const gate = useAuthGate(user);
  const {
    step: pickStep,
    pick,
    selectPick,
    goBack: backToPick,
    setParams,
  } = usePickStep(user);
  const location = useLocation();
  const page = Math.max(
    1,
    Number(new URLSearchParams(location.search).get("page") ?? "1") || 1,
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

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<{
          products: ShopProduct[];
          pages: number;
          page: number;
        }>(`/v1/commerce/products?page=${page}`);
        setProducts(data.products);
        setPages(data.pages);
        setLoadError(null);
      } catch {
        setLoadError("Could not load plates.");
        setProducts([]);
      }
    })();
  }, [page]);

  const selected = products.find((p) => p.slug === pick);
  const step = onPay ? 2 : pickStep;
  const phoneLabel = isCompleteKenyanNational(phone)
    ? formatKenyanMsisdnDisplay(phone)
    : null;
  const totalKsh = selected ? selected.price_ksh * qty : 0;

  function goBack(): void {
    if (waiting) return;
    if (onPay) {
      setOnPay(false);
      setError(null);
      return;
    }
    backToPick();
  }

  function toPay(e: FormEvent): void {
    e.preventDefault();
    if (!selected) {
      setError("Pick a plate first.");
      return;
    }
    setError(null);
    setOnPay(true);
  }

  async function sendPrompt(): Promise<void> {
    if (!selected) {
      setError("Pick a plate first.");
      return;
    }
    if (!isCompleteKenyanNational(phone)) {
      setError("Enter the nine digits after +254.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persistPayPhone(phone, user?.phone, onAuth);
      const order = await api<{ orderId: string }>("/v1/commerce/products/buy", {
        method: "POST",
        body: JSON.stringify({ slug: selected.slug, qty }),
      });
      setWaiting(true);
      show("Plate order started. Approve M-Pesa on your phone.");
      const outcome = await waitForPaid(order.orderId);
      if (outcome === "paid") {
        void navigate(`/orders/${order.orderId}`);
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

  function onChoose(p: ShopProduct): void {
    gate(continuePath("/shop", p.slug), () => {
      selectPick(p.slug);
    });
  }

  function setPage(next: number): void {
    setParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        q.set("page", String(next));
        q.delete("pick");
        return q;
      },
      { replace: true },
    );
  }

  const payReady = Boolean(selected) && Boolean(phoneLabel) && !busy;

  return (
    <StepForm
      steps={SHOP_STEPS}
      step={step}
      {...(waiting ? {} : { onBack: goBack })}
      footer={
        step === 1 ? (
          <button type="submit" form="shop-qty" disabled={!selected}>
            Pay
          </button>
        ) : step === 2 ? (
          <button type="submit" form="shop-pay" disabled={!payReady || waiting}>
            {waiting ? "Waiting for M-Pesa…" : "Receive Prompt"}
          </button>
        ) : undefined
      }
    >
      {step === 0 ? (
        <>
          {loadError ? (
            <p className="error" role="alert">
              {loadError}
            </p>
          ) : null}
          {products.length === 0 ? (
            <p className="status">No plates on the grill yet. Check back when the coals are lit.</p>
          ) : (
            <ul className="plate-grid">
              {products.map((p) => (
                <li key={p.slug}>
                  <button type="button" className="plate-card" onClick={() => onChoose(p)}>
                    <span className="plate-card-name">{p.name}</span>
                    <span className="price">{formatKsh(p.price_ksh)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 ? (
            <nav className="page-bar" aria-label="Plate pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={n === page ? "page" : undefined}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            </nav>
          ) : null}
        </>
      ) : step === 1 ? (
        <form id="shop-qty" onSubmit={toPay}>
          <label>
            Plate
            <input readOnly value={selected?.name ?? pick} />
          </label>
          <QuantityField value={qty} onChange={setQty} max={Math.max(1, Math.min(20, selected?.stock ?? 20))} />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <form
          id="shop-pay"
          onSubmit={(e) => {
            e.preventDefault();
            void sendPrompt();
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
    </StepForm>
  );
}
