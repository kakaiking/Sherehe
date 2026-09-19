import { useEffect, useId, useRef, type ReactElement } from "react";

/**
 * Centered confirm dialog. Continue is the primary action; Cancel dismisses.
 */
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}): ReactElement {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="confirm-layer">
      <button
        type="button"
        className="confirm-scrim"
        aria-label="Dismiss"
        onClick={onDismiss}
      />
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        {body ? <p className="lede">{body}</p> : null}
        <div className="confirm-actions">
          <button ref={confirmRef} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="secondary" onClick={onDismiss}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
