import type { ReactElement } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { User } from "../App";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { formatPurchaseWhen } from "../datetime";
import { PageHead } from "../flow/PageHead";
import { useSnackbar } from "../snackbar";

type OrderRow = {
  id: string;
  kind: string;
  status: string;
  total_ksh: number;
  created_at: string;
  occurred_at: string;
  title: string;
  sku_code: string | null;
  qty: number;
};

function historyLabel(o: OrderRow): string {
  const name = o.title;
  return Number(o.qty) > 1 ? `${name} × ${o.qty}` : name;
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

export function AccountPage({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}): ReactElement {
  const { show } = useSnackbar();
  const navigate = useNavigate();
  const { data, loading, error } = useApiQuery<{ orders: OrderRow[] }>(
    queryKeys.accountOrders,
    "/v1/account/orders",
    { enabled: Boolean(user), uid: user?.id ?? "anon" },
  );
  const orders = data?.orders ?? [];

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function logout(): Promise<void> {
    await api("/v1/auth/logout", { method: "POST" });
    show("Signed out.");
    // Leave /guest/account before clearing user so the signed-out
    // <Navigate to="/login" /> guard does not win the race.
    void navigate("/guest", { replace: true });
    onLogout();
  }

  return (
    <>
      <PageHead
        byline={user.displayName ?? undefined}
        lede={user.email}
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
      />
      {error ? <p className="error">{error}</p> : null}
      {loading && orders.length === 0 ? (
        <LinesSkeleton label="Loading records" />
      ) : orders.length === 0 ? (
        <p className="status">No records yet. Buy a ticket and it lands here.</p>
      ) : (
        <ul className="menu">
          {orders.map((o) => (
            <li key={`${o.id}-${o.sku_code ?? o.kind}`}>
              <Link to={`/guest/orders/${o.id}`}>
                <span className="history-ticket">{historyLabel(o)}</span>
                <span className="history-when">{formatPurchaseWhen(o.occurred_at)}</span>
              </Link>
              <span className="price">{o.total_ksh}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
