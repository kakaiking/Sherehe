import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { api, formatKsh } from "../api";
import { useCatalogEvent } from "../eventContext";
import { WhenWhere } from "../WhenWhere";

type Tickets = {
  attendeeCount: number;
  attendeeTarget: number;
  offerings: Array<{ code: string; name: string; priceKsh: number }>;
};

export function HomePage(): ReactElement {
  const event = useCatalogEvent();
  const [tickets, setTickets] = useState<Tickets | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const tk = await api<Tickets>("/v1/catalog/tickets");
        setTickets(tk);
      } catch {
        setError("The event listing is unavailable. Try again shortly.");
      }
    })();
  }, []);

  const claimed = tickets?.attendeeCount ?? 0;
  const target = tickets?.attendeeTarget ?? 200;
  const heatPct = Math.min(100, Math.round((claimed / Math.max(target, 1)) * 100));

  return (
    <div className="split">
      <section className="hero">
        <h1>{event.name}</h1>
        <WhenWhere />
        <p className="heat-label">
          {claimed} of {target} plates claimed
        </p>
        <div
          className="heat"
          role="img"
          aria-label={`${claimed} of ${target} plates claimed`}
        >
          <div className="heat-fill" style={{ width: `${heatPct}%` }} />
        </div>
        <p className="actions">
          <Link className="btn" to="/tickets">
            Grab a plate
          </Link>
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>
      <aside className="stub" aria-label="Tonight’s card">
        <strong>On sale now</strong>
        <ul className="menu">
          {(tickets?.offerings ?? []).slice(0, 6).map((o) => (
            <li key={o.code}>
              <span>{o.name}</span>
              <span className="price">{formatKsh(o.priceKsh)}</span>
            </li>
          ))}
        </ul>
        <div className="tear">
          <WhenWhere compact />
          <p>Tear after M-Pesa — the QR is your gate pass.</p>
        </div>
      </aside>
    </div>
  );
}
