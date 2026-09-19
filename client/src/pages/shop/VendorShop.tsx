import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../../api";
import { GridSkeleton, LinesSkeleton } from "../../cache/Skeleton";
import {
  invalidatePrefix,
  invalidateQuery,
  queryKeys,
  writeQuery,
} from "../../cache/queryCache";
import { useApiQuery } from "../../cache/useCachedQuery";
import { PageHead } from "../../flow/PageHead";
import { formatPurchaseWhen } from "../../datetime";
import { useSnackbar } from "../../snackbar";
import type { ShopProduct } from "./GuestShop";

type SaleRow = {
  order_id: string;
  status: string;
  total_ksh: number;
  paid_at: string | null;
  created_at: string;
  qty: number;
  unit_price_ksh: number;
  display_name: string | null;
  email: string;
  phone: string | null;
  receipt: string | null;
};

type SalesPayload = {
  product: ShopProduct;
  sales: SaleRow[];
};

const emptyForm = {
  name: "",
  description: "",
  price_ksh: 500,
  stock: 10,
};

export function VendorShop({ userId }: { userId: string }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  const { show } = useSnackbar();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const sku = params.get("sku") ?? "";
  const adding = params.get("new") === "1";
  const list = useApiQuery<{ products: ShopProduct[]; pages: number }>(
    queryKeys.products(page),
    `/v1/commerce/products?page=${page}`,
    { enabled: !sku && !adding, uid: userId },
  );
  const salesQ = useApiQuery<SalesPayload>(
    queryKeys.productSales(sku),
    `/v1/commerce/products/${encodeURIComponent(sku)}/sales`,
    { enabled: Boolean(sku), uid: userId },
  );
  const products = list.data?.products ?? [];
  const pages = list.data?.pages ?? 1;
  const sales = salesQ.data ?? null;

  async function loadList(): Promise<void> {
    invalidatePrefix(userId, "commerce:products");
    await list.reload();
  }

  useEffect(() => {
    if (list.error) setError("Could not load your meals.");
  }, [list.error]);

  useEffect(() => {
    if (!salesQ.data) return;
    setForm({
      name: salesQ.data.product.name,
      description: salesQ.data.product.description,
      price_ksh: salesQ.data.product.price_ksh,
      stock: salesQ.data.product.stock,
    });
    setEditing(false);
    setError(null);
  }, [sku, salesQ.data]);

  useEffect(() => {
    if (sku && salesQ.error) setError(salesQ.error);
  }, [sku, salesQ.error]);

  function setPage(next: number): void {
    setParams({ page: String(next) }, { replace: true });
  }

  function openAdd(): void {
    setForm(emptyForm);
    setParams({ new: "1" }, { replace: true });
    setError(null);
  }

  function closeDetail(): void {
    setParams(page > 1 ? { page: String(page) } : {}, { replace: true });
    setError(null);
  }

  async function saveNew(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api("/v1/commerce/products", {
        method: "POST",
        body: JSON.stringify(form),
      });
      show("Meal added.");
      setParams({}, { replace: true });
      await loadList();
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  async function saveEdit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!sku) return;
    setError(null);
    try {
      const next = await api<ShopProduct>(`/v1/commerce/products/${sku}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      if (sales) {
        writeQuery(userId, queryKeys.productSales(sku), {
          ...sales,
          product: { ...sales.product, ...next },
        });
      }
      invalidatePrefix(userId, "commerce:products");
      setEditing(false);
      show("Meal updated.");
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  async function removeMeal(): Promise<void> {
    if (!sku) return;
    setError(null);
    try {
      await api(`/v1/commerce/products/${sku}`, { method: "DELETE" });
      invalidateQuery(userId, queryKeys.productSales(sku));
      show("Meal removed.");
      closeDetail();
      await loadList();
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  if (adding) {
    return (
      <>
        <PageHead
          title="Add a meal"
          onBack={closeDetail}
        />
        <MealForm
          form={form}
          onChange={setForm}
          onSubmit={(e) => void saveNew(e)}
          submitLabel="Add meal"
          error={error}
        />
      </>
    );
  }

  if (sku && !sales) {
    return (
      <>
        <PageHead title="Meal" onBack={closeDetail} />
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <LinesSkeleton label="Loading meal sales" />
        )}
      </>
    );
  }

  if (sku && sales) {
    return (
      <>
        <PageHead
          title={sales.product.name}
          lede={`${formatKsh(sales.product.price_ksh)} · ${sales.product.stock} left`}
          onBack={closeDetail}
        />
        <p className="actions">
          <button type="button" className="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close editor" : "Edit meal"}
          </button>
          <button type="button" className="secondary" onClick={() => void removeMeal()}>
            Delete meal
          </button>
        </p>
        {editing ? (
          <MealForm
            form={form}
            onChange={setForm}
            onSubmit={(e) => void saveEdit(e)}
            submitLabel="Save meal"
            error={error}
          />
        ) : error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <h2>Purchases</h2>
        {sales.sales.length === 0 ? (
          <p className="status">Nobody has bought this meal yet.</p>
        ) : (
          <ul className="menu">
            {sales.sales.map((row) => (
              <li key={row.order_id}>
                <span>
                  <span className="history-ticket">
                    {row.display_name ?? row.email} · × {row.qty}
                  </span>
                  <span className="history-when">
                    {formatPurchaseWhen(row.paid_at ?? row.created_at)}
                    {row.receipt ? ` · ${row.receipt}` : ""}
                    {` · ${row.status}`}
                  </span>
                </span>
                <span className="price">{row.total_ksh}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      <PageHead title="Meals" />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="actions">
        <button type="button" onClick={openAdd}>
          Add a meal
        </button>
      </p>
      {list.loading && products.length === 0 ? (
        <GridSkeleton label="Loading meals" />
      ) : products.length === 0 ? (
        <p className="status">No meals yet. Add the first one for your stall.</p>
      ) : (
        <ul className="meal-grid">
          {products.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                className="meal-card"
                onClick={() => setParams({ sku: p.slug }, { replace: true })}
              >
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
  );
}

function MealForm({
  form,
  onChange,
  onSubmit,
  submitLabel,
  error,
}: {
  form: typeof emptyForm;
  onChange: (next: typeof emptyForm) => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  error: string | null;
}): ReactElement {
  return (
    <form onSubmit={onSubmit}>
      <label>
        Name
        <input
          value={form.name}
          maxLength={160}
          required
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          value={form.description}
          maxLength={2000}
          required
          rows={3}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </label>
      <label>
        Price (KES)
        <input
          type="number"
          min={50}
          max={200000}
          value={form.price_ksh}
          required
          onChange={(e) => onChange({ ...form, price_ksh: Number(e.target.value) })}
        />
      </label>
      <label>
        Stock
        <input
          type="number"
          min={0}
          max={100000}
          value={form.stock}
          required
          onChange={(e) => onChange({ ...form, stock: Number(e.target.value) })}
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
