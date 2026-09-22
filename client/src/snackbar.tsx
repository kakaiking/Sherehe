import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type SnackbarTone = "ok" | "error";

type SnackbarApi = {
  show: (message: string, tone?: SnackbarTone) => void;
};

const SnackbarContext = createContext<SnackbarApi | null>(null);

const HOLD_MS = 3800;

/**
 * Status chip centered under the site header for completed mutations.
 */
export function SnackbarProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [note, setNote] = useState<{
    id: number;
    message: string;
    tone: SnackbarTone;
  } | null>(null);

  const show = useCallback((message: string, tone: SnackbarTone = "ok") => {
    setNote({ id: Date.now(), message, tone });
  }, []);

  const dismiss = useCallback(() => {
    setNote(null);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {note ? (
        <div className="snackbar-host">
          <div
            key={note.id}
            className={`snackbar snackbar-${note.tone}`}
            role={note.tone === "error" ? "alert" : "status"}
          >
            <span className="snackbar-message">{note.message}</span>
            <button
              type="button"
              className="snackbar-close"
              aria-label="Dismiss"
              onClick={dismiss}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarApi {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar requires SnackbarProvider");
  }
  return ctx;
}
