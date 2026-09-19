import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { PUBLIC_UID, queryKeys } from "./cache/queryCache";
import { useApiQuery } from "./cache/useCachedQuery";
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
  const { data } = useApiQuery<CatalogEvent>(queryKeys.event, "/v1/catalog/event", {
    uid: PUBLIC_UID,
  });
  const event =
    data && data.venue && data.startsAt ? data : FALLBACK_EVENT;
  return <EventContext.Provider value={event}>{children}</EventContext.Provider>;
}

export function useCatalogEvent(): CatalogEvent {
  return useContext(EventContext);
}
