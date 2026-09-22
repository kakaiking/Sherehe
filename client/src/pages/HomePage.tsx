import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { formatKsh } from "../api";
import { HomeSkeleton } from "../cache/Skeleton";
import { PUBLIC_UID, queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { useCatalogEvent } from "../eventContext";
import { WhenWhere } from "../WhenWhere";

type Tickets = {
  attendeeCount: number;
  attendeeTarget: number;
  offerings: Array<{ code: string; name: string; priceKsh: number }>;
};

export function HomePage(): ReactElement {
  const event = useCatalogEvent();
  const { data: tickets, error } = useApiQuery<Tickets>(
    queryKeys.tickets,
    "/v1/catalog/tickets",
    { uid: PUBLIC_UID },
  );

  if (!tickets) {
    return error ? (
      <p className="error">{error}</p>
    ) : (
      <HomeSkeleton />
    );
  }

  const claimed = tickets.attendeeCount;
  const target = tickets.attendeeTarget;
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
          <Link className="btn" to="/guest/tickets">
            Grab a plate
          </Link>
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>
      <aside className="stub" aria-label="Tonight’s card">
        <strong>On sale now</strong>
        <ul className="menu">
          {tickets.offerings.slice(0, 6).map((o) => (
            <li key={o.code}>
              <span>{o.name}</span>
              <span className="price">{formatKsh(o.priceKsh)}</span>
            </li>
          ))}
        </ul>
        <div className="tear">
          <WhenWhere compact />
          <p>COME HUNGRY. LEAVE HAPPY.</p>
          <p>#SAVANNA&amp;SPICE</p>
        </div>
      </aside>
    </div>
  );
}
