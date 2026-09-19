import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { api, type ApiError } from "../api";
import type { User } from "../App";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { PageHead } from "../flow/PageHead";
import { useSnackbar } from "../snackbar";

type Overview = {
  eventName: string;
  venue: string | null;
  startsAt: string | null;
  attendeeCount: number;
  attendeeTarget: number;
  flashEnabled: boolean;
  flashEndsAt: string | null;
  canArmFlash: boolean;
  partners: Array<{
    id: string;
    kind: string;
    company_name: string;
    status: string;
  }>;
  vendors: Array<{
    id: string;
    company_name: string;
    status: string;
    package_name: string;
  }>;
  products: Array<{ slug: string; name: string; stock: number }>;
};

export function StaffPage({ user }: { user: User | null }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const { show } = useSnackbar();
  const { data, loading, reload } = useApiQuery<Overview>(
    queryKeys.staff,
    "/v1/staff/overview",
    { enabled: Boolean(user && user.role === "staff"), uid: user?.id ?? "anon" },
  );

  async function refresh(): Promise<void> {
    await reload();
  }

  if (!user || user.role !== "staff") {
    return (
      <>
        <PageHead title="Staff" />
        <p>
          Staff only. <Link to="/login">Sign in</Link> with Google using a staff email.
        </p>
      </>
    );
  }

  async function flash(enabled: boolean): Promise<void> {
    setError(null);
    try {
      await api("/v1/staff/flash", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      await refresh();
      show(enabled ? "Flash sale armed." : "Flash sale closed.");
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  async function review(id: string, status: "confirmed" | "rejected"): Promise<void> {
    try {
      await api(`/v1/staff/partners/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
      show(status === "confirmed" ? "Partner confirmed." : "Partner rejected.");
    } catch (err) {
      setError((err as ApiError).detail);
      show((err as ApiError).detail, "error");
    }
  }

  return (
    <>
      <PageHead title="Staff" />
      {error ? <p className="error" role="alert">{error}</p> : null}
      {data ? (
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
          <h2>Partner applications</h2>
          <ul className="staff-list">
            {data.partners.map((p) => (
              <li key={p.id}>
                {p.company_name} · {p.kind} · {p.status}
                {p.status === "pending" ? (
                  <div className="staff-actions">
                    <button type="button" onClick={() => void review(p.id, "confirmed")}>
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void review(p.id, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <h2>Vendors</h2>
          <ul className="staff-list">
            {data.vendors.map((v) => (
              <li key={v.id}>
                {v.company_name} · {v.package_name} · {v.status}
              </li>
            ))}
          </ul>
          <h2>Product stock</h2>
          <ul className="staff-list">
            {data.products.map((p) => (
              <li key={p.slug}>
                {p.name}: {p.stock}
              </li>
            ))}
          </ul>
        </>
      ) : loading ? (
        <LinesSkeleton lines={8} label="Loading staff overview" />
      ) : (
        <p className="status">Loading staff overview…</p>
      )}
    </>
  );
}
