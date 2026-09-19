import { type ReactElement } from "react";
import { eventDayParts, formatEventDay, venueLines } from "./datetime";
import { useCatalogEvent } from "./eventContext";

/**
 * Calendar-block + studio. The date is the night; the clock stays off the face
 * until doors are published as a guest fact.
 */
export function WhenWhere({
  compact = false,
  ticket = false,
}: {
  compact?: boolean;
  /** Stacked night / hall / locality, matching the PDF stub. */
  ticket?: boolean;
}): ReactElement | null {
  const event = useCatalogEvent();
  const parts = eventDayParts(event.startsAt);
  if (!parts) return null;
  const { hall, locality } = venueLines(event.venue);

  if (ticket) {
    const day = formatEventDay(event.startsAt);
    return (
      <div className="pass-stub-meta" aria-label={`${day}, ${event.venue}`}>
        <time dateTime={event.startsAt} className="pass-stub-day">
          {day}
        </time>
        <p className="pass-stub-hall">{hall}</p>
        {locality ? <p className="pass-stub-locality">{locality}</p> : null}
      </div>
    );
  }

  if (compact) {
    return (
      <p className="whenwhere-compact">
        <time dateTime={event.startsAt}>
          {parts.day} {parts.month}
        </time>
        <span aria-hidden="true"> · </span>
        <span>{hall}</span>
      </p>
    );
  }

  return (
    <div className="whenwhere" aria-label={`${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${event.venue}`}>
      <p className="whenwhere-cal">
        <span className="whenwhere-weekday">{parts.weekday}</span>
        <time dateTime={event.startsAt} className="whenwhere-day">
          {parts.day}
        </time>
        <span className="whenwhere-month">
          {parts.month} {parts.year}
        </span>
      </p>
      <p className="whenwhere-place">
        <span className="whenwhere-hall">{hall}</span>
        {locality ? <span className="whenwhere-locality">{locality}</span> : null}
      </p>
    </div>
  );
}
