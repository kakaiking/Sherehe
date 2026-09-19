import type { ReactElement } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { User } from "../App";
import { LinesSkeleton } from "../cache/Skeleton";
import { queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { formatPurchaseWhen } from "../datetime";
import { PageHead } from "../flow/PageHead";
import { formatKenyanMsisdnDisplay } from "../phone";
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
    onLogout();
    show("Signed out.");
    void navigate("/login", { replace: true });
  }

  return (
    <>
      <PageHead
        title="You"
        byline={user.displayName ?? undefined}
        lede={
          <>
            {user.email}
            {user.phone
              ? ` · ${formatKenyanMsisdnDisplay(user.phone)}`
              : ""}
          </>
        }
      />
      <p className="actions">
        <button type="button" className="secondary" onClick={() => void logout()}>
          Sign out
        </button>
        {user.role === "staff" ? (
          <Link className="btn secondary" to="/staff">
            Staff
          </Link>
        ) : null}
      </p>
      <h2>Records</h2>
      {error ? <p className="error">{error}</p> : null}
      {loading && orders.length === 0 ? (
        <LinesSkeleton label="Loading records" />
      ) : orders.length === 0 ? (
        <p className="status">No records yet. Buy a ticket or a meal and it lands here.</p>
      ) : (
        <ul className="menu">
          {orders.map((o) => (
            <li key={`${o.id}-${o.sku_code ?? o.kind}`}>
              <Link to={`/orders/${o.id}`}>
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
