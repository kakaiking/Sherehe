import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { api } from "./api";
import { EVENT_STARTS_AT, EVENT_VENUE } from "./eventFacts";

export type CatalogEvent = {
  name: string;
  presenter: string;
  venue: string;
  startsAt: string;
};

export const FALLBACK_EVENT: CatalogEvent = {
  name: "Sherehe",
  presenter: "Food With Walter Kenya",
  venue: EVENT_VENUE,
  startsAt: EVENT_STARTS_AT,
};

const EventContext = createContext<CatalogEvent>(FALLBACK_EVENT);

export function EventProvider({ children }: { children: ReactNode }): ReactElement {
  const [event, setEvent] = useState<CatalogEvent>(FALLBACK_EVENT);

  useEffect(() => {
    void (async () => {
      try {
        const next = await api<CatalogEvent>("/v1/catalog/event");
        if (next.venue && next.startsAt) setEvent(next);
      } catch {
        /* keep fallback so the night and studio still read on a catalog miss */
      }
    })();
  }, []);

  return <EventContext.Provider value={event}>{children}</EventContext.Provider>;
}

export function useCatalogEvent(): CatalogEvent {
  return useContext(EventContext);
}
