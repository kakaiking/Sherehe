import { useEffect, useId, useState, type ReactElement, type SVGProps } from "react";
import { api, formatKsh, type ApiError } from "../api";
import type { User } from "../App";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { saveContinue } from "../flow/continue";
import { PageHead } from "../flow/PageHead";
import { PortalChrome } from "../portals/PortalChrome";
import { useSnackbar } from "../snackbar";
import { AuthPage } from "./AuthPage";
import { FlashDateCalendar } from "./staff/FlashDateCalendar";
import { PartnersDesk } from "./staff/PartnersDesk";
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

type TicketTypeStat = {
  code: string;
  name: string;
  priceKsh: number;
  capacity: number | null;
  sold: number;
};

type Overview = {
  eventName: string;
  venue: string | null;
  startsAt: string | null;
  attendeeCount: number;
  attendeeTarget: number;
  flashEnabled: boolean;
  flashStartsAt: string | null;
  flashEndsAt: string | null;
  flashDates: string[];
  canArmFlash: boolean;
  ticketBuyers: TicketBuyer[];
  ticketTypes: TicketTypeStat[];
  overview: {
    attendeeCount: number;
    attendeeTarget: number;
    paidTicketOrders: number;
    ticketRevenueKsh: number;
    partnerCount: number;
  };
};

type DeskId =
  | "dashboard"
  | "attendees"
  | "tickets"
  | "partners"
  | "scan"
  | "you";

const ATTENDEES_PAGE_SIZE = 10;

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

function SignOutIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 16l4-4-4-4M20 12H10"
      />
    </svg>
  );
}

/** Dock: Home · Attendees · Tickets · Partners · Scan · You. Flash sale lives on Tickets. */
const DESKS: Array<{ id: DeskId; label: string; icon: ReactElement }> = [
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
    id: "attendees",
    label: "Attendees",
    icon: (
      <DeskIcon>
        <circle cx="9" cy="8" r="3.25" />
        <circle cx="16.5" cy="9.5" r="2.5" />
        <path d="M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5" />
        <path d="M14 14.2c1.7-.4 3.5.2 4.5 2.8" />
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
    id: "partners",
    label: "Partners",
    icon: (
      <DeskIcon>
        <path d="M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
        <path d="M16 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M2.5 20c.7-3 2.8-4.8 5.5-4.8S13 17 13.7 20" />
        <path d="M14 20c.5-2.2 2-3.5 4-3.5s3.5 1.3 4 3.5" />
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
  {
    id: "you",
    label: "You",
    icon: (
      <DeskIcon>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.4-3.2 3.8-5 7-5s5.6 1.8 7 5" />
      </DeskIcon>
    ),
  },
];

function sameFlashDates(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((d, i) => d === right[i]);
}

export function StaffPage({
  user,
  onAuth,
  onLogout,
}: {
  user: User | null;
  onAuth: (user: User) => void;
  onLogout: () => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [desk, setDesk] = useState<DeskId>("dashboard");
  const [attendeesPage, setAttendeesPage] = useState(0);
  const [flashModalOpen, setFlashModalOpen] = useState(false);
  const [flashCloseConfirm, setFlashCloseConfirm] = useState(false);
  const [draftFlashDates, setDraftFlashDates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const baseId = useId();
  const flashTitleId = useId();
  const flashSaveTitleId = useId();
  const { show } = useSnackbar();
  const staffOk = Boolean(user && user.role === "staff");
  const { data, loading, reload } = useApiQuery<Overview>(
    queryKeys.staff,
    "/v1/staff/overview",
    { enabled: staffOk, uid: user?.id ?? "anon" },
  );

  useEffect(() => {
    if (!flashModalOpen || !data) return;
    setDraftFlashDates(data.flashDates ?? []);
  }, [flashModalOpen, data?.flashDates]);

  useEffect(() => {
    if (!flashModalOpen) setFlashCloseConfirm(false);
  }, [flashModalOpen]);

  useEffect(() => {
    if (!flashModalOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (flashCloseConfirm) {
        setFlashCloseConfirm(false);
        return;
      }
      requestCloseFlash();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flashModalOpen, flashCloseConfirm, draftFlashDates, data?.flashDates]);

  if (!user || user.role !== "staff") {
    saveContinue("/admin");
    return (
      <PortalChrome brandTo="/admin" brandEvent={false}>
        <AuthPage onAuth={onAuth} mode="admin" />
      </PortalChrome>
    );
  }

  async function saveFlashDates(dates: string[], message: string): Promise<void> {
    if (dates.length > 0 && !data?.canArmFlash) {
      setError("Target of 200 attendees already reached. No flash sale.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/v1/staff/flash", {
        method: "POST",
        body: JSON.stringify({ dates }),
      });
      await reload();
      show(message);
      setFlashCloseConfirm(false);
      setFlashModalOpen(false);
    } catch (err) {
      setError((err as ApiError).detail);
    } finally {
      setBusy(false);
    }
  }

  function requestCloseFlash(): void {
    if (!sameFlashDates(draftFlashDates, data?.flashDates ?? [])) {
      setFlashCloseConfirm(true);
      return;
    }
    setFlashModalOpen(false);
  }

  function discardFlashChanges(): void {
    setFlashCloseConfirm(false);
    setFlashModalOpen(false);
  }

  function openDesk(next: DeskId): void {
    setDesk(next);
    if (next !== "tickets") setFlashModalOpen(false);
  }

  function goBack(): void {
    if (desk !== "dashboard") openDesk("dashboard");
  }

  async function logout(): Promise<void> {
    await api("/v1/auth/logout", { method: "POST" });
    show("Signed out.");
    onLogout();
  }

  const active = DESKS.find((d) => d.id === desk) ?? DESKS[0]!;
  const ov = data?.overview;
  const ticketTypes = data?.ticketTypes ?? [];
  const ticketBuyers = data?.ticketBuyers ?? [];
  const attendeesPageCount = Math.max(
    1,
    Math.ceil(ticketBuyers.length / ATTENDEES_PAGE_SIZE),
  );
  const safeAttendeesPage = Math.min(attendeesPage, attendeesPageCount - 1);
  const attendeesPageStart = safeAttendeesPage * ATTENDEES_PAGE_SIZE;
  const pageBuyers = ticketBuyers.slice(
    attendeesPageStart,
    attendeesPageStart + ATTENDEES_PAGE_SIZE,
  );
  const attendeesRangeStart =
    ticketBuyers.length === 0 ? 0 : attendeesPageStart + 1;
  const attendeesRangeEnd = Math.min(
    attendeesPageStart + ATTENDEES_PAGE_SIZE,
    ticketBuyers.length,
  );

  return (
    <PortalChrome
      brandTo="/admin"
      brandEvent={false}
      desktopNav={
        <nav className="nav nav-desktop" aria-label="Primary">
          {DESKS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-current={d.id === desk ? "page" : undefined}
              onClick={() => openDesk(d.id)}
            >
              {d.label}
            </button>
          ))}
        </nav>
      }
      dock={
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
      }
    >
      <div className="admin-shell">
        {desk === "you" ? (
          <PageHead
            byline={user.displayName ?? user.email}
            lede={user.displayName ? user.email : undefined}
            trail={
              <button
                type="button"
                className="sign-out-icon"
                aria-label="Sign out"
                onClick={() => void logout()}
              >
                <SignOutIcon />
              </button>
            }
            onBack={goBack}
          />
        ) : (
          <PageHead
            title={deskTitle(desk)}
            onBack={desk === "dashboard" ? () => undefined : goBack}
          />
        )}
        {desk === "you" ? (
          <section
            role="tabpanel"
            id={`${baseId}-panel-you`}
            aria-labelledby={`${baseId}-tab-you`}
            className="admin-panel"
          />
        ) : null}
        {desk !== "you" && error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {desk !== "you" && loading && !data ? (
          <LinesSkeleton label="Loading admin" />
        ) : null}
        {desk !== "you" && data ? (
          <section
            role="tabpanel"
            id={`${baseId}-panel-${active.id}`}
            aria-labelledby={`${baseId}-tab-${active.id}`}
            className="admin-panel"
          >
            {desk === "dashboard" && ov ? (
              <div className="admin-stat-grid">
                <button
                  type="button"
                  className="admin-stat"
                  onClick={() => openDesk("attendees")}
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
                  className="admin-stat admin-stat-wide"
                  onClick={() => openDesk("partners")}
                >
                  <span className="admin-stat-label">Partners</span>
                  <span className="admin-stat-value">{ov.partnerCount ?? 0}</span>
                  <span className="admin-stat-hint">Logos & contacts</span>
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
                  <span className="admin-stat-value">Scan</span>
                </button>
              </div>
            ) : null}

            {desk === "attendees" ? (
              <>
                <ul className="staff-list">
                  {ticketBuyers.length === 0 ? (
                    <li>
                      <p className="status">No paid ticket buyers yet.</p>
                    </li>
                  ) : (
                    pageBuyers.map((b) => (
                      <li key={b.id}>
                        <div className="admin-record-head">
                          <strong>
                            {b.display_name || b.email || "Ticket buyer"}
                          </strong>
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
                {ticketBuyers.length > 0 ? (
                  <div className="ticket-scan-history-pager">
                    <span className="admin-record-meta" aria-live="polite">
                      {attendeesRangeStart}-{attendeesRangeEnd} of{" "}
                      {ticketBuyers.length}
                    </span>
                    <button
                      type="button"
                      className="ticket-scan-icon-btn"
                      aria-label="Previous attendees page"
                      disabled={safeAttendeesPage <= 0}
                      onClick={() => setAttendeesPage(safeAttendeesPage - 1)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        aria-hidden="true"
                      >
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 5 8 12l7 7"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="ticket-scan-icon-btn"
                      aria-label="Next attendees page"
                      disabled={safeAttendeesPage >= attendeesPageCount - 1}
                      onClick={() => setAttendeesPage(safeAttendeesPage + 1)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        aria-hidden="true"
                      >
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {desk === "tickets" ? (
              <>
                <div className="admin-tickets-toolbar">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setFlashModalOpen(true);
                    }}
                  >
                    Set flash sale
                  </button>
                </div>

                {ticketTypes.length === 0 ? (
                  <p className="status">No ticket types configured.</p>
                ) : (
                  <div className="admin-stat-grid">
                    {ticketTypes.map((t) => (
                      <div key={t.code} className="admin-stat admin-stat-static">
                        <span className="admin-stat-label">{t.name}</span>
                        <span className="admin-stat-value">{t.sold}</span>
                        <span className="admin-stat-hint">
                          {t.capacity != null
                            ? `of ${t.capacity} · ${formatKsh(t.priceKsh)}`
                            : formatKsh(t.priceKsh)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {flashModalOpen ? (
                  <div className="confirm-layer">
                    <button
                      type="button"
                      className="confirm-scrim"
                      aria-label="Dismiss"
                      onClick={requestCloseFlash}
                    />
                    <div
                      className="confirm-dialog admin-flash-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby={flashTitleId}
                    >
                      <button
                        type="button"
                        className="sheet-close"
                        aria-label="Close"
                        onClick={requestCloseFlash}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      <h2 id={flashTitleId}>Flash sale</h2>
                      <FlashDateCalendar
                        selectedDates={draftFlashDates}
                        onChange={setDraftFlashDates}
                      />
                      <div className="confirm-actions">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (draftFlashDates.length > 0 && !data.canArmFlash)
                          }
                          onClick={() =>
                            void saveFlashDates(
                              draftFlashDates,
                              draftFlashDates.length
                                ? "Flash sale days saved."
                                : "Flash sale cleared.",
                            )
                          }
                        >
                          Save flash days
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {flashCloseConfirm ? (
                  <div className="confirm-layer confirm-layer-nest">
                    <button
                      type="button"
                      className="confirm-scrim"
                      aria-label="Dismiss"
                      onClick={() => setFlashCloseConfirm(false)}
                    />
                    <div
                      className="confirm-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby={flashSaveTitleId}
                    >
                      <h2 id={flashSaveTitleId}>Save changes?</h2>
                      <p className="lede">
                        You have unsaved flash sale days.
                      </p>
                      <div className="confirm-actions">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (draftFlashDates.length > 0 && !data.canArmFlash)
                          }
                          onClick={() =>
                            void saveFlashDates(
                              draftFlashDates,
                              draftFlashDates.length
                                ? "Flash sale days saved."
                                : "Flash sale cleared.",
                            )
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={discardFlashChanges}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {desk === "partners" ? (
              <PartnersDesk uid={user?.id ?? "anon"} />
            ) : null}

            {desk === "scan" ? (
              <TicketScanDesk uid={user?.id ?? "anon"} />
            ) : null}
          </section>
        ) : null}
      </div>
    </PortalChrome>
  );
}

function deskTitle(desk: DeskId): string {
  switch (desk) {
    case "dashboard":
      return "Dashboard";
    case "attendees":
      return "Attendees";
    case "tickets":
      return "Tickets";
    case "partners":
      return "Partners";
    case "scan":
      return "Gate scan";
    case "you":
      return "You";
  }
}
