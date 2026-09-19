import type { ReactElement } from "react";

export function ChoiceSkeleton({
  count = 4,
  label,
}: {
  count?: number;
  label: string;
}): ReactElement {
  return (
    <ul className="choice-list skeleton-list" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="skeleton-card" />
        </li>
      ))}
    </ul>
  );
}

export function GridSkeleton({
  count = 9,
  label,
}: {
  count?: number;
  label: string;
}): ReactElement {
  return (
    <ul className="meal-grid skeleton-list" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="skeleton-meal" />
        </li>
      ))}
    </ul>
  );
}

export function LinesSkeleton({
  lines = 4,
  label,
}: {
  lines?: number;
  label: string;
}): ReactElement {
  return (
    <div className="lines-skeleton" aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`skeleton-line${i % 3 === 2 ? " short" : i % 3 === 1 ? " mid" : ""}`}
        />
      ))}
    </div>
  );
}

export function HomeSkeleton(): ReactElement {
  return (
    <div className="split" aria-busy="true" aria-label="Loading the night">
      <section className="hero">
        <div className="skeleton-line title" />
        <div className="skeleton-line mid" />
        <div className="skeleton-heat" />
        <div className="skeleton-line action" />
      </section>
      <aside className="stub" aria-hidden="true">
        <div className="skeleton-line mid" />
        <div className="skeleton-line" />
        <div className="skeleton-line mid" />
        <div className="skeleton-line short" />
      </aside>
    </div>
  );
}
