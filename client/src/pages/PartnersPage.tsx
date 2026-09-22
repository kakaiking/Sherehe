import { useEffect, useRef, useState, type ReactElement } from "react";
import { LinesSkeleton } from "../cache/Skeleton";
import { PUBLIC_UID, queryKeys } from "../cache/queryCache";
import { useApiQuery } from "../cache/useCachedQuery";
import { PageHead } from "../flow/PageHead";
import { formatKenyanMsisdnDisplay } from "../phone";

type Partner = {
  id: string;
  name: string;
  description: string;
  phone: string;
  email: string;
  sortOrder: number;
};

type PartnersPayload = { partners: Partner[] };

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:+${digits}` : "#";
}

function partnerInitial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

function PartnerStall({
  partner,
  flip,
}: {
  partner: Partner;
  flip: boolean;
}): ReactElement {
  const ref = useRef<HTMLElement>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const phoneLabel = formatKenyanMsisdnDisplay(partner.phone);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      el.classList.add("partners-stall--in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("partners-stall--in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <article
      ref={ref}
      className={`partners-stall${flip ? " partners-stall--flip" : ""}`}
    >
      <div
        className="partners-stall-sign"
        aria-hidden={logoFailed || undefined}
      >
        {logoFailed ? (
          <span className="partners-stall-mono">{partnerInitial(partner.name)}</span>
        ) : (
          <img
            src={`/v1/catalog/partners/${partner.id}/logo`}
            alt=""
            loading="lazy"
            onError={() => setLogoFailed(true)}
            onLoad={(e) => {
              const img = e.currentTarget;
              // Seed / stub logos are often 1×1; treat them as missing.
              if (img.naturalWidth < 32 || img.naturalHeight < 32) {
                setLogoFailed(true);
              }
            }}
          />
        )}
      </div>
      <div className="partners-stall-copy">
        <p className="partners-stall-kicker">Crew</p>
        <h2>{partner.name}</h2>
        <p className="partners-stall-blurb">{partner.description}</p>
        <div className="partners-stall-actions">
          <a
            className="partners-stall-action"
            href={telHref(partner.phone)}
            aria-label={`Call ${partner.name} at ${phoneLabel}`}
          >
            <span className="partners-stall-action-label">Call</span>
            <span className="partners-stall-action-value">{phoneLabel}</span>
          </a>
          <a
            className="partners-stall-action partners-stall-action--mail"
            href={`mailto:${partner.email}`}
            aria-label={`Email ${partner.name} at ${partner.email}`}
          >
            <span className="partners-stall-action-label">Email</span>
            <span className="partners-stall-action-value">{partner.email}</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export function PartnersPage(): ReactElement {
  const { data, error } = useApiQuery<PartnersPayload>(
    queryKeys.catalogPartners,
    "/v1/catalog/partners",
    { uid: PUBLIC_UID },
  );

  if (!data) {
    return (
      <div className="partners-page">
        <PageHead
          title="Partners"
          lede="The crews behind tonight."
        />
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <LinesSkeleton label="Loading partners" />
        )}
      </div>
    );
  }

  const partners = data.partners;

  return (
    <div className="partners-page">
      <div className="partners-page-intro">
        <PageHead
          title="Partners"
          lede={
            partners.length === 0
              ? "Partner lineup coming soon — check back closer to the night."
              : "Meet the crews cooking, pouring, and running the night."
          }
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      {partners.length > 0 ? (
        <div className="partners-lineup" aria-label="Event partners">
          {partners.map((p, i) => (
            <PartnerStall key={p.id} partner={p} flip={i % 2 === 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
