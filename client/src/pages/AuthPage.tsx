import { useEffect, useState, type ReactElement, type SVGProps } from "react";
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
  isAdminConfirming,
  pendingMatches,
  readGooglePending,
  setAdminConfirming,
} from "../auth/googleStart";
import { beginGoogleSignIn } from "../auth/beginGoogleSignIn";
import { afterAuthPath } from "../flow/continue";
import { HistoryBackButton } from "../flow/HistoryBackButton";
import { PageHead } from "../flow/PageHead";
import {
  signedInMessage,
  storePortal,
  type Portal,
} from "../portal";
import { useSnackbar } from "../snackbar";
import { WhenWhere } from "../WhenWhere";

const completingKeys = new Set<string>();

/** Test-only: OAuth completion keys persist across remounts in the same JS realm. */
export function resetOauthCompletingKeysForTests(): void {
  completingKeys.clear();
}

function GateIcon({
  children,
  ...props
}: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function AdminGlyph(): ReactElement {
  return (
    <GateIcon>
      <path d="M12 3 4.5 6.5v5c0 4.5 3.2 8.4 7.5 9.5 4.3-1.1 7.5-5 7.5-9.5v-5L12 3Z" />
      <path d="M9.5 12.2 11.2 14l3.5-3.8" />
    </GateIcon>
  );
}

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

/**
 * Post–Google-picker hold screen — voided-stub language,
 * not the idle sign-in form.
 */
function AuthLoadingStub({
  stamp,
  title,
  lede,
  tear,
  status,
}: {
  stamp?: string;
  title?: string;
  lede?: string;
  tear?: string;
  status: string;
}): ReactElement {
  return (
    <div className="auth-loading">
      <article
        className={
          title ? "auth-loading-stub" : "auth-loading-stub auth-loading-stub--solo"
        }
        aria-labelledby="auth-loading-title"
      >
        {stamp ? <p className="auth-loading-stamp">{stamp}</p> : null}
        <div className="auth-loading-punch" aria-hidden="true" />
        {title ? <h1 id="auth-loading-title">{title}</h1> : null}
        {lede ? <p className="lede">{lede}</p> : null}
        {title ? (
          <p className="status" role="status">
            {status}
          </p>
        ) : (
          <h1 id="auth-loading-title">{status}</h1>
        )}
        {tear ? (
          <div className="tear auth-loading-tear">
            <p>{tear}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function AdminConfirmingView({ error }: { error: string | null }): ReactElement {
  if (!error) {
    return (
      <AuthLoadingStub
        stamp="Staff"
        title="Hold still"
        lede="Google is back. We are matching you to the admin list."
        tear="One clipboard. One listed account."
        status="Confirming admin access…"
      />
    );
  }
  return (
    <div className="auth-confirming">
      <PageHead title="Sign in" />
      <div className="portal-gates portal-gates-single" role="group" aria-label="Admin">
        <button type="button" aria-pressed="true">
          <AdminGlyph />
          Admin
        </button>
      </div>
      <p className="error" role="alert">
        {error}
      </p>
    </div>
  );
}

export function AuthPage({
  onAuth,
  mode = "portals",
}: {
  onAuth: (user: User) => void;
  /** Admin gate: single centered Admin chip; only STAFF_EMAIL may enter. */
  mode?: "portals" | "admin";
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { show } = useSnackbar();
  const adminMode = mode === "admin";
  const oauthCode = searchParams.get("code");
  const oauthState = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const [confirming, setConfirming] = useState(
    () =>
      Boolean(oauthCode && oauthState) ||
      (adminMode && isAdminConfirming()) ||
      (!adminMode && readGooglePending()?.resume === "admin" && Boolean(oauthCode)),
  );

  useEffect(() => {
    storePortal(adminMode ? "admin" : "user");
  }, [adminMode]);

  /**
   * Google always hands off to `/login`. If the PKCE start was from Admin,
   * bounce to `/admin` with the same query so we never paint Guest sign-in.
   */
  useEffect(() => {
    if (adminMode) return;
    const pending = readGooglePending();
    if (!pending || pending.resume !== "admin") return;
    if (oauthCode && oauthState) {
      setAdminConfirming(true);
      setConfirming(true);
      const next = new URLSearchParams();
      next.set("code", oauthCode);
      next.set("state", oauthState);
      void navigate(`/admin?${next.toString()}`, { replace: true });
      return;
    }
    if (oauthError) {
      setAdminConfirming(true);
      void navigate(`/admin?error=${encodeURIComponent(oauthError)}`, {
        replace: true,
      });
    }
  }, [adminMode, oauthCode, oauthState, oauthError, navigate]);

  useEffect(() => {
    const code = parseGoogleLoginError(searchParams.get("error"));
    if (!code) return;
    setAdminConfirming(false);
    setConfirming(false);
    setError(googleLoginMessage(code));
  }, [searchParams]);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) return;
    if (!adminMode) {
      const pending = readGooglePending();
      if (pending?.resume === "admin") return;
    }
    const key = `${state}:${code.length}`;
    if (completingKeys.has(key)) return;
    completingKeys.add(key);
    if (adminMode) {
      setAdminConfirming(true);
      setConfirming(true);
    } else {
      setAdminConfirming(false);
      setConfirming(true);
    }
    const pending = readGooglePending();
    if (!pending || !pendingMatches(pending, state)) {
      clearGooglePending();
      setAdminConfirming(false);
      setConfirming(false);
      setError(googleLoginMessage("google_state"));
      void navigate(adminMode ? "/admin" : "/login", { replace: true });
      return;
    }
    void (async () => {
      try {
        const user = await api<User>("/v1/auth/google/callback", {
          method: "POST",
          body: JSON.stringify({
            code,
            verifier: pending.verifier,
            portal: adminMode ? "admin" : "user",
          }),
        });
        clearGooglePending();
        if (adminMode && user.role !== "staff") {
          await api("/v1/auth/logout", { method: "POST" });
          setAdminConfirming(false);
          setConfirming(false);
          setError("Only the admin Google account can sign in here.");
          void navigate("/admin", { replace: true });
          return;
        }
        const gate: Portal = adminMode ? "admin" : "user";
        storePortal(gate);
        onAuth(user);
        setError(null);
        show(signedInMessage(gate));
        setAdminConfirming(false);
        setConfirming(false);
        void navigate(adminMode ? "/admin" : afterAuthPath(), { replace: true });
      } catch (err) {
        clearGooglePending();
        setAdminConfirming(false);
        setConfirming(false);
        setError(googleLoginMessage(googlePostErrorCode(err)));
        void navigate(adminMode ? "/admin" : "/login", { replace: true });
      }
    })();
  }, [searchParams, onAuth, navigate, show, adminMode]);

  useEffect(() => {
    if (searchParams.get("from") !== "google") return;
    if (!adminMode) {
      const pending = readGooglePending();
      if (pending?.resume === "admin") return;
    }
    if (adminMode) {
      setAdminConfirming(true);
      setConfirming(true);
    } else {
      setAdminConfirming(false);
      setConfirming(true);
    }
    let cancelled = false;
    void (async () => {
      try {
        const user = await api<User>("/v1/auth/me");
        if (cancelled) return;
        if (adminMode && user.role !== "staff") {
          await api("/v1/auth/logout", { method: "POST" });
          if (!cancelled) {
            setAdminConfirming(false);
            setConfirming(false);
            setError("Only the admin Google account can sign in here.");
          }
          return;
        }
        const gate: Portal = adminMode ? "admin" : "user";
        storePortal(gate);
        onAuth(user);
        setError(null);
        show(signedInMessage(gate));
        setAdminConfirming(false);
        setConfirming(false);
        void navigate(adminMode ? "/admin" : afterAuthPath(), { replace: true });
      } catch (err) {
        if (!cancelled) {
          setAdminConfirming(false);
          setConfirming(false);
          setError(googleLoginMessage(googleSessionErrorCode(err)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, onAuth, navigate, show, adminMode]);

  async function startGoogle(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await beginGoogleSignIn({
        portal: adminMode ? "admin" : "user",
        resume: adminMode ? "admin" : "login",
      });
    } catch (err) {
      setError(googleLoginMessage(googlePostErrorCode(err)));
      setBusy(false);
    }
  }

  /** Only an Admin PKCE start may paint the admin confirming shell on /login. */
  const handoffToAdmin =
    !adminMode &&
    readGooglePending()?.resume === "admin" &&
    Boolean(oauthCode && oauthState);
  const showAdminConfirm =
    adminMode && (confirming || isAdminConfirming()) && !error;

  if (showAdminConfirm || handoffToAdmin) {
    return <AdminConfirmingView error={error} />;
  }

  if (adminMode && error) {
    return (
      <>
        <AdminConfirmingView error={error} />
        <p className="actions">
          <button
            className="btn google"
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
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

  if (confirming && !adminMode) {
    return <AuthLoadingStub status="Sneaking you in…" />;
  }

  return (
    <div className="auth-sign-in">
      <div className="auth-sign-in-top">
        <HistoryBackButton />
      </div>
      <div className="auth-sign-in-above">
        <h1 className="auth-sign-in-title">Sign in</h1>
        {adminMode ? (
          <div
            className="portal-gates portal-gates-single"
            role="group"
            aria-label="Admin"
          >
            <button type="button" aria-pressed="true">
              <AdminGlyph />
              Admin
            </button>
          </div>
        ) : (
          <WhenWhere />
        )}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <p className="auth-sign-in-action">
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
      <div className="auth-sign-in-balance" aria-hidden="true" />
    </div>
  );
}
