import { type ReactElement, type ReactNode } from "react";
import { HistoryBackButton } from "./HistoryBackButton";

/**
 * Centered page title with a left-arrow back control in the same row.
 */
export function PageHead({
  title,
  byline,
  lede,
  onBack,
}: {
  title: string;
  byline?: ReactNode;
  lede?: ReactNode;
  onBack?: () => void;
}): ReactElement {
  return (
    <header className="page-head">
      <div className="page-head-lead">
        <HistoryBackButton {...(onBack ? { onClick: onBack } : {})} />
        <h1>{title}</h1>
      </div>
      {byline ? <p className="account-name">{byline}</p> : null}
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}
