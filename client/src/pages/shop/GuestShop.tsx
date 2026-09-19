import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../../api";
import type { User } from "../../App";
import { GridSkeleton } from "../../cache/Skeleton";
import {
  markPrefixStale,
  markStale,
  queryKeys,
} from "../../cache/queryCache";
import { useApiQuery } from "../../cache/useCachedQuery";
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

export type ShopStall = {
  id: string;
  name: string;
  meal_count: number;
};

export function GuestShop({
  user,
  onAuth = () => undefined,
}: {
  user: User | null;
  onAuth?: (user: User) => void;
}): ReactElement {
  const [qty, setQty] = useState(1);
  const [phone, setPhone] = useState(() =>
    extractKenyanNationalDigits(user?.phone ?? ""),
  );
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
  const search = new URLSearchParams(location.search);
  const page = Math.max(1, Number(search.get("page") ?? "1") || 1);
  const vendorId = search.get("vendor") ?? "";
  const shopUid = user?.id ?? "anon";
  const stallsQ = useApiQuery<{ stalls: ShopStall[] }>(
    queryKeys.stalls,
    "/v1/commerce/stalls",
    { uid: shopUid },
  );
  const catalog = useApiQuery<{
    products: ShopProduct[];
    pages: number;
    page: number;
  }>(
    queryKeys.products(page, vendorId),
    `/v1/commerce/products?page=${page}&vendor=${encodeURIComponent(vendorId)}`,
    { uid: shopUid, enabled: Boolean(vendorId) },
  );
  const stalls = stallsQ.data?.stalls ?? [];
  const products = catalog.data?.products ?? [];
  const pages = catalog.data?.pages ?? 1;

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

  const stall = stalls.find((s) => s.id === vendorId);
  const selected = products.find((p) => p.slug === pick);
  const catalogStep = pickStep === 1 ? 2 : vendorId ? 1 : 0;
  const step = onPay ? 3 : catalogStep;
  const phoneLabel = isCompleteKenyanNational(phone)
    ? formatKenyanMsisdnDisplay(phone)
    : null;
  const totalKsh = selected ? selected.price_ksh * qty : 0;
  const steps = stall
    ? SHOP_STEPS.map((s) => (s.id === "pick" ? { ...s, title: stall.name } : s))
    : SHOP_STEPS;

  function goBack(): void {
    if (waiting) return;
    if (onPay) {
      setOnPay(false);
      setError(null);
      return;
    }
    if (pickStep === 1) {
      backToPick();
      return;
    }
    setParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        q.delete("vendor");
        q.delete("page");
        q.delete("pick");
        return q;
      },
      { replace: true },
    );
  }

  function toPay(e: FormEvent): void {
    e.preventDefault();
    if (!selected) {
      setError("Pick a meal first.");
      return;
    }
    setError(null);
    setOnPay(true);
  }

  async function sendPrompt(): Promise<void> {
    if (!selected) {
      setError("Pick a meal first.");
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
      markPrefixStale(shopUid, "commerce:products");
      markStale(shopUid, queryKeys.stalls);
      if (user) markStale(user.id, queryKeys.accountOrders);
      setWaiting(true);
      show("Meal order started. Approve M-Pesa on your phone.");
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

  function onChooseStall(s: ShopStall): void {
    setParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        q.set("vendor", s.id);
        q.delete("page");
        q.delete("pick");
        return q;
      },
      { replace: true },
    );
  }

  function onChoose(p: ShopProduct): void {
    gate(continuePath("/shop", p.slug, { vendor: vendorId }), () => {
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
      steps={steps}
      step={step}
      {...(waiting ? {} : { onBack: goBack })}
      footer={
        step === 2 ? (
          <button type="submit" form="shop-qty" disabled={!selected}>
            Pay
          </button>
        ) : step === 3 ? (
          <button type="submit" form="shop-pay" disabled={!payReady || waiting}>
            {waiting ? "Waiting for M-Pesa…" : "Receive Prompt"}
          </button>
        ) : undefined
      }
    >
      {step === 0 ? (
        <>
          {stallsQ.error ? (
            <p className="error" role="alert">
              {stallsQ.error}
            </p>
          ) : null}
          {stallsQ.loading && stalls.length === 0 ? (
            <GridSkeleton label="Loading vendors" />
          ) : stalls.length === 0 ? (
            <p className="status">No vendors are serving meals yet. Check back when the coals are lit.</p>
          ) : (
            <ul className="meal-grid">
              {stalls.map((s) => (
                <li key={s.id}>
                  <button type="button" className="meal-card" onClick={() => onChooseStall(s)}>
                    <span className="meal-card-name">{s.name}</span>
                    <span className="price">
                      {Number(s.meal_count) === 1 ? "1 meal" : `${Number(s.meal_count)} meals`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : step === 1 ? (
        <>
          {catalog.error ? (
            <p className="error" role="alert">
              {catalog.error}
            </p>
          ) : null}
          {catalog.loading && products.length === 0 ? (
            <GridSkeleton label="Loading meals" />
          ) : products.length === 0 ? (
            <p className="status">This stall has no meals yet.</p>
          ) : (
            <ul className="meal-grid">
              {products.map((p) => (
                <li key={p.slug}>
                  <button type="button" className="meal-card" onClick={() => onChoose(p)}>
                    <span className="meal-card-name">{p.name}</span>
                    <span className="price">{formatKsh(p.price_ksh)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 ? (
            <nav className="page-bar" aria-label="Meal pages">
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
      ) : step === 2 ? (
        <form id="shop-qty" onSubmit={toPay}>
          <label>
            Meal
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
