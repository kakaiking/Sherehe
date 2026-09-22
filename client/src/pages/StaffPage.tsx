import { useEffect, useId, useState, type ReactElement, type SVGProps } from "react";
import { api, formatKsh, type ApiError } from "../api";
import type { User } from "../App";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { saveContinue } from "../flow/continue";
import { PageHead } from "../flow/PageHead";
import { useSnackbar } from "../snackbar";
import { AuthPage } from "./AuthPage";
import { TicketScanDesk } from "./staff/TicketScanDesk";

type TicketBuyer = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  total_ksh: number;
  seats: number;
  qty: number;
  paid_at: string | null;
};

type Overview = {
  eventName: string;
  venue: string | null;
  startsAt: string | null;
  attendeeCount: number;
  attendeeTarget: number;
  flashEnabled: boolean;
  flashEndsAt: string | null;
  canArmFlash: boolean;
  ticketBuyers: TicketBuyer[];
  overview: {
    attendeeCount: number;
    attendeeTarget: number;
    paidTicketOrders: number;
    ticketRevenueKsh: number;
  };
};

type DeskId = "dashboard" | "tickets" | "scan" | "event";

function DeskIcon({
  children,
  ...props
}: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Dock mirrors guest: Home · Tickets · Scan. Event ops stay on the Attendees card. */
const DESKS: Array<{ id: Exclude<DeskId, "event">; label: string; icon: ReactElement }> = [
  {
    id: "dashboard",
    label: "Home",
    icon: (
      <DeskIcon>
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10.5V20h12v-9.5" />
      </DeskIcon>
    ),
  },
  {
    id: "tickets",
    label: "Tickets",
    icon: (
      <DeskIcon>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M8 7v10M16 7v10" />
      </DeskIcon>
    ),
  },
  {
    id: "scan",
    label: "Scan",
    icon: (
      <DeskIcon>
        <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
        <rect x="8" y="8" width="8" height="8" rx="1" />
      </DeskIcon>
    ),
  },
];

function LiveClock(): ReactElement {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time className="admin-clock" dateTime={now.toISOString()}>
      {now.toLocaleTimeString("en-KE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Africa/Nairobi",
      })}
    </time>
  );
}

export function StaffPage({
  user,
  onAuth,
}: {
  user: User | null;
  onAuth: (user: User) => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [desk, setDesk] = useState<DeskId>("dashboard");
  const baseId = useId();
  const { show } = useSnackbar();
  const staffOk = Boolean(user && user.role === "staff");
  const { data, loading, reload } = useApiQuery<Overview>(
    queryKeys.staff,
    "/v1/staff/overview",
    { enabled: staffOk, uid: user?.id ?? "anon" },
  );

  if (!staffOk) {
    saveContinue("/admin");
    return <AuthPage onAuth={onAuth} mode="admin" />;
  }

  async function flash(enabled: boolean): Promise<void> {
    setError(null);
    try {
      await api("/v1/staff/flash", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      await reload();
      show(enabled ? "Flash sale armed." : "Flash sale closed.");
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  function openDesk(next: DeskId): void {
    setDesk(next);
  }

  function goBack(): void {
    if (desk !== "dashboard") openDesk("dashboard");
  }

  const active =
    DESKS.find((d) => d.id === desk) ??
    (desk === "event" ? { id: "event" as const, label: "Event" } : DESKS[0]!);
  const ov = data?.overview;

  return (
    <div className="admin-shell">
      <PageHead
        title={deskTitle(desk)}
        byline={<LiveClock />}
        lede={desk === "dashboard" ? "Tap a card. Jump in." : deskSubtitle(desk, data)}
        onBack={desk === "dashboard" ? () => undefined : goBack}
      />
      {error ? <p className="error" role="alert">{error}</p> : null}
      {loading && !data ? <LinesSkeleton label="Loading admin" /> : null}
      {data ? (
        <section
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={
            desk === "event" ? undefined : `${baseId}-tab-${active.id}`
          }
          aria-label={desk === "event" ? "Event" : undefined}
          className="admin-panel"
        >
          {desk === "dashboard" && ov ? (
            <div className="admin-stat-grid">
              <button
                type="button"
                className="admin-stat"
                onClick={() => openDesk("event")}
              >
                <span className="admin-stat-label">Attendees</span>
                <span className="admin-stat-value">{ov.attendeeCount}</span>
                <span className="admin-stat-hint">of {ov.attendeeTarget}</span>
              </button>
              <button
                type="button"
                className="admin-stat"
                onClick={() => openDesk("tickets")}
              >
                <span className="admin-stat-label">Ticket orders</span>
                <span className="admin-stat-value">{ov.paidTicketOrders}</span>
                <span className="admin-stat-hint">{formatKsh(ov.ticketRevenueKsh)}</span>
              </button>
              <button
                type="button"
                className="admin-stat admin-stat-scan"
                onClick={() => openDesk("scan")}
              >
                <DeskIcon className="admin-stat-scan-icon" width={28} height={28}>
                  <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
                  <rect x="8" y="8" width="8" height="8" rx="1" />
                </DeskIcon>
                <span className="admin-stat-scan-copy">
                  <span className="admin-stat-label">Gate</span>
                  <span className="admin-stat-value">Scan</span>
                  <span className="admin-stat-hint">Check in tickets</span>
                </span>
              </button>
            </div>
          ) : null}

          {desk === "tickets" ? (
            <ul className="staff-list">
              {(data.ticketBuyers ?? []).length === 0 ? (
                <li>
                  <p className="status">No paid ticket buyers yet.</p>
                </li>
              ) : (
                data.ticketBuyers.map((b) => (
                  <li key={b.id}>
                    <div className="admin-record-head">
                      <strong>{b.display_name || b.email || "Ticket buyer"}</strong>
                      <span>{formatKsh(b.total_ksh)}</span>
                    </div>
                    <p className="admin-record-meta">
                      {[
                        b.email,
                        b.phone,
                        b.seats > 0
                          ? `${b.seats} seat${b.seats === 1 ? "" : "s"}`
                          : `${b.qty} ticket${b.qty === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))
              )}
            </ul>
          ) : null}

          {desk === "scan" ? (
            <TicketScanDesk uid={user?.id ?? "anon"} />
          ) : null}

          {desk === "event" ? (
            <>
              <p className="lede">
                {data.eventName}: {data.attendeeCount} / {data.attendeeTarget} attendees
              </p>
              <p>
                Flash sale {data.flashEnabled ? "armed" : "off"}
                {data.flashEndsAt ? ` until ${data.flashEndsAt}` : ""}.
              </p>
              <p className="staff-actions">
                <button
                  type="button"
                  disabled={!data.canArmFlash}
                  onClick={() => void flash(true)}
                >
                  Arm flash sale
                </button>
                <button type="button" className="secondary" onClick={() => void flash(false)}>
                  Close flash sale
                </button>
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <nav className="admin-dock" role="tablist" aria-label="Admin desks">
        {DESKS.map((d) => {
          const selected = d.id === desk;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${d.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${active.id}`}
              className={selected ? "active" : undefined}
              onClick={() => openDesk(d.id)}
            >
              {d.icon}
              {d.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function deskTitle(desk: DeskId): string {
  switch (desk) {
    case "dashboard":
      return "Dashboard";
    case "tickets":
      return "Tickets ordered";
    case "scan":
      return "Gate scan";
    case "event":
      return "Event";
  }
}

function deskSubtitle(desk: DeskId, data: Overview | undefined): string {
  if (!data) return "";
  switch (desk) {
    case "dashboard":
      return "Tonight's ticket desk";
    case "tickets":
      return `${(data.ticketBuyers ?? []).length} paid buyer${(data.ticketBuyers ?? []).length === 1 ? "" : "s"} · ${formatKsh(data.overview.ticketRevenueKsh)}`;
    case "scan":
      return "Camera check-in · history below";
    case "event":
      return "Flash sale controls";
  }
}
