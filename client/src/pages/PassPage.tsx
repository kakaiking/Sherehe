import { useEffect, useState, type ReactElement } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, type ApiError } from "../api";
import { LinesSkeleton } from "../cache/Skeleton";
import { PageHead } from "../flow/PageHead";
import { WhenWhere } from "../WhenWhere";

type PassView = {
  status: "issued" | "used" | "void";
  code: string;
  label: string;
  holderName: string;
  eventName: string;
  venue: string | null;
  startsAt: string | null;
  usedAt: string | null;
  readyForGate: boolean;
  headline: string;
  detail: string;
};

export function PassPage(): ReactElement {
  const params = useParams();
  const [search] = useSearchParams();
  const publicId = params["publicId"] ?? "";
  const sig = search.get("sig") ?? "";
  const [pass, setPass] = useState<PassView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setPass(null);
      if (publicId.length !== 32 || sig.length !== 64) {
        if (!cancelled) {
          setError("This pass link is incomplete.");
          setLoading(false);
        }
        return;
      }
      try {
        const view = await api<PassView>(
          `/v1/passes/${encodeURIComponent(publicId)}?sig=${encodeURIComponent(sig)}`,
        );
        if (!cancelled) setPass(view);
      } catch (err) {
        if (!cancelled) setError((err as ApiError).detail);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId, sig]);

  const tone =
    pass?.status === "issued"
      ? "ok"
      : pass?.status === "used"
        ? "used"
        : "bad";

  return (
    <div className="pass-page">
      <PageHead
        title={pass?.eventName ?? "Sherehe pass"}
        lede={pass ? undefined : "Gate pass"}
      />
      {loading ? <LinesSkeleton lines={5} label="Loading pass" /> : null}
      {error ? (
        <article className="pass-result pass-result-bad" role="alert">
          <p className="pass-result-stamp">Not valid</p>
          <h1>Could not open this pass</h1>
          <p className="lede">{error}</p>
          <p className="pass-result-hint">
            Ask staff to scan your ticket at the gate, or open the stub from your
            order download.
          </p>
        </article>
      ) : null}
      {pass ? (
        <article className={`pass-result pass-result-${tone}`}>
          <p className="pass-result-stamp">
            {pass.readyForGate ? "Valid" : pass.status === "used" ? "Used" : "Void"}
          </p>
          <h1>{pass.headline}</h1>
          <p className="lede">{pass.detail}</p>
          <div className="pass-result-card">
            <p className="pass-result-label">{pass.label}</p>
            <p className="pass-result-holder">{pass.holderName}</p>
            <WhenWhere ticket />
          </div>
          <p className="pass-result-hint">
            {pass.readyForGate
              ? "Show this screen or your printed stub at the door. Staff check-in is what counts."
              : "If you believe this is wrong, find a steward at the gate."}
          </p>
        </article>
      ) : null}
      <p className="actions pass-page-actions">
        <Link className="btn" to="/guest">
          Home
        </Link>
        <Link className="btn secondary" to="/guest/tickets">
          Tickets
        </Link>
      </p>
    </div>
  );
}
