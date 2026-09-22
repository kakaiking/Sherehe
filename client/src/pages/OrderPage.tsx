import { useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadPdf, formatKsh, type ApiError } from "../api";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys, SESSION_UID } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { PageHead } from "../flow/PageHead";
import { StepForm } from "../flow/StepForm";
import { TICKET_STEPS } from "../flow/ticketSteps";
import { useSnackbar } from "../snackbar";
import { ticketLabel } from "../ticketLabel";
import { WhenWhere } from "../WhenWhere";

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
  const { show } = useSnackbar();
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

  async function savePdf(): Promise<void> {
    if (!order) return;
    // Leave the stub screen immediately; finish the save in the background
    // and confirm on Tickets so the PDF never replaces this page.
    void navigate("/guest/tickets");
    try {
      await downloadPdf(`/v1/orders/${order.id}/tickets.pdf`, "sherehe-tickets.pdf");
      show("Ticket downloaded.");
    } catch (err) {
      show((err as ApiError).detail, "error");
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
