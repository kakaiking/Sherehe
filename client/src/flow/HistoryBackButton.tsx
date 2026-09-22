import { type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { homeForPortal, syncPortalFromPath } from "../portal";

/**
 * Icon-only control that returns to the previous history entry, or the
 * active portal home when this tab has nowhere to go.
 */
export function HistoryBackButton({
  onClick,
}: {
  onClick?: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();

  function go(): void {
    if (onClick) {
      onClick();
      return;
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    // Direct loads and replaced in-flow URLs stay at idx 0; -1 would no-op.
    if (location.key === "default" || typeof idx !== "number" || idx <= 0) {
      void navigate(homeForPortal(syncPortalFromPath(location.pathname)));
      return;
    }
    void navigate(-1);
  }

  return (
    <button type="button" className="history-back" aria-label="Back" onClick={go}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 5 8 12l7 7"
        />
      </svg>
    </button>
  );
}
