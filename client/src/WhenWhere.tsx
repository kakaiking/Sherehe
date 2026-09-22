import { type ReactElement } from "react";
import { eventDayParts, formatEventDay, venueLines } from "./datetime";
import { EVENT_DOORS } from "./eventFacts";
import { useCatalogEvent } from "./eventContext";

/**
 * Calendar-block + studio + doors. Date stays on the cal tile; hours sit under locality.
 */
export function WhenWhere({
  compact = false,
  ticket = false,
}: {
  compact?: boolean;
  /** Stacked night / hall / locality / doors, matching the PDF stub. */
  ticket?: boolean;
}): ReactElement | null {
  const event = useCatalogEvent();
  const parts = eventDayParts(event.startsAt);
  if (!parts) return null;
  const { hall, locality } = venueLines(event.venue);

  if (ticket) {
    const day = formatEventDay(event.startsAt);
    return (
      <div className="pass-stub-meta" aria-label={`${day}, ${event.venue}, ${EVENT_DOORS}`}>
        <time dateTime={event.startsAt} className="pass-stub-day">
          {day}
        </time>
        <p className="pass-stub-hall">{hall}</p>
        {locality ? <p className="pass-stub-locality">{locality}</p> : null}
        <p className="pass-stub-doors">{EVENT_DOORS}</p>
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
    <div
      className="whenwhere"
      aria-label={`${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${event.venue}, ${EVENT_DOORS}`}
    >
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
        <span className="whenwhere-doors">{EVENT_DOORS}</span>
      </p>
    </div>
  );
}
