import { useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadPdf, formatKsh, type ApiError } from "../api";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys, SESSION_UID } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { PageHead } from "../flow/PageHead";
import { StepForm } from "../flow/StepForm";
import { TICKET_STEPS } from "../flow/ticketSteps";
import { ticketLabel } from "../ticketLabel";
import { WhenWhere } from "../WhenWhere";
import { SHOP_RECEIPT_STEP, SHOP_STEPS } from "./shop/shopSteps";

type Ticket = {
  publicId: string;
  signature: string;
  qrDataUrl: string;
  code: string;
  holderName: string;
};

type Order = {
  id: string;
  kind: string;
  status: string;
  totalKsh: number;
  mpesaReceipt: string | null;
  items: Array<{ title: string; qty: number }>;
  tickets: Ticket[];
};

export function OrderPage(): ReactElement {
  const params = useParams();
  const navigate = useNavigate();
  const id = params["id"] ?? "";
  const { data: order, error, loading } = useApiQuery<Order>(
    queryKeys.order(id),
    `/v1/orders/${id}`,
    { enabled: Boolean(id), uid: SESSION_UID, freshMs: 0 },
  );
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (!order && error) return <p className="error" role="alert">{error}</p>;
  if (!order) {
    return loading ? (
      <LinesSkeleton lines={6} label="Loading order" />
    ) : (
      <p className="status">Loading order…</p>
    );
  }

  const ticketPaid = order.kind === "tickets" && order.status === "paid";
  const productPaid = order.kind === "product" && order.status === "paid";
  const meal = order.items[0];

  async function savePdf(): Promise<void> {
    if (!order) return;
    setDownloading(true);
    setPdfError(null);
    try {
      if (order.kind === "product") {
        await downloadPdf(`/v1/orders/${order.id}/receipt.pdf`, "sherehe-receipt.pdf");
        void navigate("/account");
        return;
      }
      await downloadPdf(`/v1/orders/${order.id}/tickets.pdf`, "sherehe-tickets.pdf");
      void navigate("/shop");
    } catch (err) {
      setPdfError((err as ApiError).detail);
    } finally {
      setDownloading(false);
    }
  }

  const body = (
    <>
      {pdfError ? (
        <p className="error" role="alert">
          {pdfError}
        </p>
      ) : null}
      {order.status === "pending" ? (
        <p className="status">
          Approve the M-Pesa prompt on your phone. If it times out, start a new
          checkout.
        </p>
      ) : null}
      <div className="ticket-stack">
        {order.tickets.map((t) => (
          <article className="stub pass-stub" key={t.publicId}>
            <p className="pass-stub-brand">Sherehe</p>
            <p className="pass-stub-tag">the pit is open</p>
            <p className="stub-pass">{ticketLabel(t.code)}</p>
            <img
              className="qr"
              alt={`${ticketLabel(t.code)} gate QR`}
              src={t.qrDataUrl}
            />
            <WhenWhere ticket />
            <div className="tear">
              <p className="stub-holder">{t.holderName}</p>
              <p className="stub-gate">Gate scan</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );

  if (order.kind === "tickets") {
    return (
      <StepForm
        steps={TICKET_STEPS}
        step={3}
        footer={
          ticketPaid ? (
            <button type="button" onClick={() => void savePdf()} disabled={downloading}>
              {downloading ? "Preparing PDF…" : "Download ticket"}
            </button>
          ) : undefined
        }
      >
        {body}
      </StepForm>
    );
  }

  if (order.kind === "product") {
    return (
      <StepForm
        steps={SHOP_STEPS}
        step={SHOP_RECEIPT_STEP}
        footer={
          productPaid ? (
            <button type="button" onClick={() => void savePdf()} disabled={downloading}>
              {downloading ? "Preparing PDF…" : "Download receipt"}
            </button>
          ) : undefined
        }
      >
        {pdfError ? (
          <p className="error" role="alert">
            {pdfError}
          </p>
        ) : null}
        {order.status === "pending" ? (
          <p className="status">
            Approve the M-Pesa prompt on your phone. If it times out, start a new
            checkout.
          </p>
        ) : null}
        <p className="pick-summary">
          {meal ? `${meal.title} × ${meal.qty}` : "Meal"}
        </p>
        <label>
          Amount
          <input readOnly value={formatKsh(order.totalKsh)} />
        </label>
        {order.mpesaReceipt ? (
          <label>
            M-Pesa receipt
            <input readOnly value={order.mpesaReceipt} />
          </label>
        ) : null}
      </StepForm>
    );
  }

  return (
    <>
      <PageHead
        title="Order"
        lede={`${order.kind} · ${order.status} · ${formatKsh(order.totalKsh)}`}
      />
      {body}
    </>
  );
}
