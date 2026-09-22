import { type ReactElement, type ReactNode } from "react";
import { HistoryBackButton } from "./HistoryBackButton";

/**
 * Action row (back + optional trail) with title and/or identity below —
 * never on the same horizontal line as the back button.
 * Optional `trail` mirrors the back slot on the right (e.g. account sign-out).
 * Omit `title` when the identity byline is enough (e.g. You / account).
 */
export function PageHead({
  title,
  byline,
  lede,
  trail,
  onBack,
}: {
  title?: string;
  byline?: ReactNode;
  lede?: ReactNode;
  trail?: ReactNode;
  onBack?: () => void;
}): ReactElement {
  return (
    <header className="page-head">
      <div className="page-head-lead">
        <HistoryBackButton {...(onBack ? { onClick: onBack } : {})} />
        {trail ? <div className="page-head-trail">{trail}</div> : null}
      </div>
      {title ? <h1>{title}</h1> : null}
      {byline ? (
        title ? (
          <p className="account-name">{byline}</p>
        ) : (
          <h1 className="account-name">{byline}</h1>
        )
      ) : null}
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}
