import { useEffect, useState, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { User } from "../App";
import { api } from "../api";
import {
  googleLoginMessage,
  googlePostErrorCode,
  googleSessionErrorCode,
  parseGoogleLoginError,
} from "../auth/googleLoginError";
import {
  clearGooglePending,
  googleAuthorizationUrl,
  leaveForGoogle,
  newPkce,
  pendingMatches,
  readGooglePending,
  storeGooglePending,
  type GoogleClientConfig,
} from "../auth/googleStart";
import { afterAuthPath } from "../flow/continue";
import { PageHead } from "../flow/PageHead";
import {
  PORTALS,
  readStoredPortal,
  storePortal,
  type Portal,
} from "../portal";
import { useSnackbar } from "../snackbar";

const PORTAL_COPY: Record<Portal, { label: string }> = {
  user: {
    label: "User",
  },
  partner: {
    label: "Partner",
  },
  vendor: {
    label: "Vendor",
  },
};

const completingKeys = new Set<string>();

function GoogleMark(): ReactElement {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.5 7.3l6.2 5.2C38.9 37.1 44 31.2 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

export function AuthPage({
  onAuth,
}: {
  onAuth: (user: User) => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [portal, setPortal] = useState<Portal>(readStoredPortal);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { show } = useSnackbar();

  useEffect(() => {
    const code = parseGoogleLoginError(searchParams.get("error"));
    if (!code) return;
    setError(googleLoginMessage(code));
  }, [searchParams]);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) return;
    const key = `${state}:${code.length}`;
    if (completingKeys.has(key)) return;
    completingKeys.add(key);
    const pending = readGooglePending();
    void navigate("/login", { replace: true });
    if (!pending || !pendingMatches(pending, state)) {
      clearGooglePending();
      setError(googleLoginMessage("google_state"));
      return;
    }
    void (async () => {
      try {
        const user = await api<User>("/v1/auth/google/callback", {
          method: "POST",
          body: JSON.stringify({
            code,
            verifier: pending.verifier,
            portal: pending.portal,
          }),
        });
        clearGooglePending();
        onAuth(user);
        setError(null);
        show("Signed in.");
        void navigate(afterAuthPath());
      } catch (err) {
        clearGooglePending();
        setError(googleLoginMessage(googlePostErrorCode(err)));
      }
    })();
  }, [searchParams, onAuth, navigate, show]);

  useEffect(() => {
    if (searchParams.get("from") !== "google") return;
    let cancelled = false;
    void (async () => {
      try {
        const user = await api<User>("/v1/auth/me");
        if (cancelled) return;
        onAuth(user);
        setError(null);
        show("Signed in.");
        void navigate(afterAuthPath());
      } catch (err) {
        if (!cancelled) {
          setError(googleLoginMessage(googleSessionErrorCode(err)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, onAuth, navigate, show]);

  async function startGoogle(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const cfg = await api<GoogleClientConfig>("/v1/auth/google");
      if (!cfg.enabled || !cfg.clientId || !cfg.redirectUri) {
        setError(googleLoginMessage("google_off"));
        return;
      }
      const pkce = await newPkce();
      storeGooglePending({
        state: pkce.state,
        verifier: pkce.verifier,
        portal,
      });
      leaveForGoogle(
        googleAuthorizationUrl({
          clientId: cfg.clientId,
          redirectUri: cfg.redirectUri,
          state: pkce.state,
          challenge: pkce.challenge,
        }),
      );
    } catch (err) {
      setError(googleLoginMessage(googlePostErrorCode(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Sign in" />
      <div className="portal-gates" role="group" aria-label="Choose portal">
        {PORTALS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={portal === id}
            onClick={() => {
              setPortal(id);
              storePortal(id);
            }}
          >
            {PORTAL_COPY[id].label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p>
        <button
          className="btn google"
          type="button"
          disabled={busy}
          onClick={() => {
            void startGoogle();
          }}
        >
          <GoogleMark />
          Continue with Google
        </button>
      </p>
    </>
  );
}
