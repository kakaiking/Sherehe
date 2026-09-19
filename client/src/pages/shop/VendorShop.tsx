import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatKsh, type ApiError } from "../../api";
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

export function VendorShop(): ReactElement {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [sales, setSales] = useState<SalesPayload | null>(null);
  const [params, setParams] = useSearchParams();
  const { show } = useSnackbar();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const sku = params.get("sku") ?? "";
  const adding = params.get("new") === "1";

  async function loadList(): Promise<void> {
    const data = await api<{ products: ShopProduct[]; pages: number }>(
      `/v1/commerce/products?page=${page}`,
    );
    setProducts(data.products);
    setPages(data.pages);
  }

  useEffect(() => {
    if (sku || adding) return;
    void loadList().catch(() => setError("Could not load your plates."));
  }, [page, sku, adding]);

  useEffect(() => {
    if (!sku) {
      setSales(null);
      return;
    }
    void (async () => {
      try {
        const data = await api<SalesPayload>(`/v1/commerce/products/${sku}/sales`);
        setSales(data);
        setForm({
          name: data.product.name,
          description: data.product.description,
          price_ksh: data.product.price_ksh,
          stock: data.product.stock,
        });
        setEditing(false);
        setError(null);
      } catch (err) {
        setError((err as ApiError).detail);
      }
    })();
  }, [sku]);

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
    setSales(null);
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
      show("Plate added.");
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
      setSales((cur) => (cur ? { ...cur, product: { ...cur.product, ...next } } : cur));
      setEditing(false);
      show("Plate updated.");
    } catch (err) {
      setError((err as ApiError).detail);
    }
  }

  async function removePlate(): Promise<void> {
    if (!sku) return;
    setError(null);
    try {
      await api(`/v1/commerce/products/${sku}`, { method: "DELETE" });
      show("Plate removed.");
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
          title="Add a plate"
          onBack={closeDetail}
        />
        <PlateForm
          form={form}
          onChange={setForm}
          onSubmit={(e) => void saveNew(e)}
          submitLabel="Add plate"
          error={error}
        />
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
            {editing ? "Close editor" : "Edit plate"}
          </button>
          <button type="button" className="secondary" onClick={() => void removePlate()}>
            Delete plate
          </button>
        </p>
        {editing ? (
          <PlateForm
            form={form}
            onChange={setForm}
            onSubmit={(e) => void saveEdit(e)}
            submitLabel="Save plate"
            error={error}
          />
        ) : error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <h2>Purchases</h2>
        {sales.sales.length === 0 ? (
          <p className="status">Nobody has bought this plate yet.</p>
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
      <PageHead title="Plates" />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="actions">
        <button type="button" onClick={openAdd}>
          Add a plate
        </button>
      </p>
      {products.length === 0 ? (
        <p className="status">No plates yet. Add the first one for your stall.</p>
      ) : (
        <ul className="plate-grid">
          {products.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                className="plate-card"
                onClick={() => setParams({ sku: p.slug }, { replace: true })}
              >
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
  );
}

function PlateForm({
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
