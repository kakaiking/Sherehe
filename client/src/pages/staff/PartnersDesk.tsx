import {
  useId,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";
import { api, type ApiError } from "../../api";
import { LinesSkeleton } from "../../cache/Skeleton";
import { markStale, PUBLIC_UID, queryKeys } from "../../cache/queryCache";
import { useApiQuery } from "../../cache/useCachedQuery";
import { ConfirmModal } from "../../flow/ConfirmModal";
import { KenyanPhoneField } from "../../KenyanPhoneField";
import {
  extractKenyanNationalDigits,
  formatKenyanMsisdnDisplay,
  isCompleteKenyanNational,
  kenyanPhonePayload,
} from "../../phone";
import { useSnackbar } from "../../snackbar";

export type EventPartner = {
  id: string;
  name: string;
  description: string;
  phone: string;
  email: string;
  sortOrder: number;
  hasLogo: boolean;
};

type PartnersList = { partners: EventPartner[] };

type LogoPayload = { mime: string; data: string };

type FormState = {
  name: string;
  description: string;
  phoneNational: string;
  email: string;
  logo: LogoPayload | null;
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  phoneNational: "",
  email: "",
  logo: null,
});

function readLogoFile(file: File): Promise<LogoPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve({ mime: file.type || "image/jpeg", data: result });
    };
    reader.readAsDataURL(file);
  });
}

export function PartnersDesk({ uid }: { uid: string }): ReactElement {
  const { show } = useSnackbar();
  const formId = useId();
  const { data, loading, reload } = useApiQuery<PartnersList>(
    queryKeys.staffPartners,
    "/v1/staff/event-partners",
    { uid },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<EventPartner | null>(null);

  const partners = data?.partners ?? [];

  function beginCreate(): void {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
    setError(null);
  }

  function beginEdit(p: EventPartner): void {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description,
      phoneNational: extractKenyanNationalDigits(p.phone),
      email: p.email,
      logo: null,
    });
    setFormOpen(true);
    setError(null);
  }

  function cancelForm(): void {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function onLogoChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const logo = await readLogoFile(file);
      setForm((prev) => ({ ...prev, logo }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  async function saveForm(): Promise<void> {
    const name = form.name.trim();
    const description = form.description.trim();
    const email = form.email.trim();
    if (!name || !description || !email) {
      setError("Name, description, and email are required.");
      return;
    }
    if (!isCompleteKenyanNational(form.phoneNational)) {
      setError("Enter a valid Kenyan mobile number.");
      return;
    }
    if (!editingId && !form.logo) {
      setError("Add a logo image (JPEG, PNG, or WebP).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        const body: Record<string, unknown> = {
          name,
          description,
          phone: kenyanPhonePayload(form.phoneNational),
          email,
        };
        if (form.logo) body["logo"] = form.logo;
        await api(`/v1/staff/event-partners/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        show(`Updated ${name}.`);
      } else {
        await api("/v1/staff/event-partners", {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            phone: kenyanPhonePayload(form.phoneNational),
            email,
            logo: form.logo,
          }),
        });
        show(`Added ${name}.`);
      }
      markStale(PUBLIC_UID, queryKeys.catalogPartners);
      markStale(uid, queryKeys.staff);
      cancelForm();
      await reload();
    } catch (err) {
      setError((err as ApiError).detail);
    } finally {
      setBusy(false);
    }
  }

  async function deletePartner(p: EventPartner): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/staff/event-partners/${p.id}`, { method: "DELETE" });
      markStale(PUBLIC_UID, queryKeys.catalogPartners);
      markStale(uid, queryKeys.staff);
      show(`Removed ${p.name}.`);
      setPendingDelete(null);
      if (editingId === p.id) cancelForm();
      await reload();
    } catch (err) {
      setError((err as ApiError).detail);
    } finally {
      setBusy(false);
    }
  }

  async function movePartner(index: number, dir: -1 | 1): Promise<void> {
    const next = index + dir;
    if (next < 0 || next >= partners.length) return;
    const ids = partners.map((p) => p.id);
    const tmp = ids[index]!;
    ids[index] = ids[next]!;
    ids[next] = tmp;
    setBusy(true);
    setError(null);
    try {
      await api("/v1/staff/event-partners/reorder", {
        method: "PUT",
        body: JSON.stringify({ ids }),
      });
      markStale(PUBLIC_UID, queryKeys.catalogPartners);
      show("Partner order saved.");
      await reload();
    } catch (err) {
      setError((err as ApiError).detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="partners-desk">
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="staff-actions">
        <button type="button" onClick={beginCreate} disabled={busy || formOpen}>
          Add partner
        </button>
      </div>

      {formOpen ? (
        <form
          className="partners-desk-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveForm();
          }}
        >
          <h3>{editingId ? "Edit partner" : "New partner"}</h3>
          <label htmlFor={`${formId}-name`}>
            Name
            <input
              id={`${formId}-name`}
              value={form.name}
              maxLength={120}
              required
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label htmlFor={`${formId}-desc`}>
            Description
            <textarea
              id={`${formId}-desc`}
              value={form.description}
              maxLength={2000}
              rows={4}
              required
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </label>
          <KenyanPhoneField
            value={form.phoneNational}
            onChange={(phoneNational) =>
              setForm((f) => ({ ...f, phoneNational }))
            }
            disabled={busy}
          />
          <label htmlFor={`${formId}-email`}>
            Email
            <input
              id={`${formId}-email`}
              type="email"
              value={form.email}
              maxLength={255}
              required
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label htmlFor={`${formId}-logo`}>
            Logo {editingId ? "(optional — leave blank to keep)" : ""}
            <input
              id={`${formId}-logo`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => void onLogoChange(e)}
            />
          </label>
          {form.logo ? (
            <p className="admin-record-meta">New logo selected.</p>
          ) : null}
          <div className="staff-actions">
            <button type="submit" disabled={busy}>
              {editingId ? "Save changes" : "Add partner"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={cancelForm}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading && !data ? <LinesSkeleton label="Loading partners" /> : null}

      {!loading || data ? (
        <ul className="staff-list partners-desk-list">
          {partners.length === 0 ? (
            <li>
              <p className="status">No partners yet. Add the first one.</p>
            </li>
          ) : (
            partners.map((p, index) => (
              <li key={p.id}>
                <div className="partners-desk-row">
                  <img
                    className="partners-desk-thumb"
                    src={`/v1/catalog/partners/${p.id}/logo`}
                    alt=""
                  />
                  <div className="partners-desk-copy">
                    <div className="admin-record-head">
                      <strong>{p.name}</strong>
                    </div>
                    <p className="admin-record-meta">
                      {formatKenyanMsisdnDisplay(p.phone)} · {p.email}
                    </p>
                    <p className="partners-desk-blurb">{p.description}</p>
                    <div className="staff-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || index === 0}
                        aria-label={`Move ${p.name} up`}
                        onClick={() => void movePartner(index, -1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || index === partners.length - 1}
                        aria-label={`Move ${p.name} down`}
                        onClick={() => void movePartner(index, 1)}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || formOpen}
                        onClick={() => beginEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setPendingDelete(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {pendingDelete ? (
        <ConfirmModal
          title={`Remove ${pendingDelete.name}?`}
          body="This removes them from the guest Partners page."
          confirmLabel="Delete"
          onConfirm={() => void deletePartner(pendingDelete)}
          onDismiss={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}
