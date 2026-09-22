import { useEffect, useRef, useState, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, ensureCsrf } from "./api";
import { hasOauthHandoffParams } from "./auth/googleStart";
import {
  loadQuery,
  peekQuery,
  queryKeys,
  resetPrivateCache,
  SESSION_UID,
  setCacheUid,
  writeQuery,
} from "./cache/queryCache";
import { AuthPage } from "./pages/AuthPage";
import { AccountPage } from "./pages/AccountPage";
import { HomePage } from "./pages/HomePage";
import { OrderPage } from "./pages/OrderPage";
import { PassPage } from "./pages/PassPage";
import { StaffPage } from "./pages/StaffPage";
import { TicketsPage } from "./pages/TicketsPage";
import { GuestLayout } from "./portals/guest/GuestLayout";
import { PortalChrome } from "./portals/PortalChrome";
import { SnackbarProvider } from "./snackbar";
import { EventProvider } from "./eventContext";
import {
  syncPortalFromPath,
  type Portal,
  type UserRole,
} from "./portal";

export type User = {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  displayName: string | null;
  givenName: string | null;
};

function readCachedUser(): User | null {
  const peeked = peekQuery<User | null>(SESSION_UID, queryKeys.me);
  if (!peeked.hit || peeked.value === null) return null;
  if (typeof peeked.value !== "object" || !("id" in peeked.value)) return null;
  return peeked.value;
}

export function App(): ReactElement {
  const location = useLocation();
  const [portal, setPortal] = useState<Portal>(() =>
    syncPortalFromPath(location.pathname),
  );
  const [user, setUserState] = useState<User | null>(() => {
    const cached = readCachedUser();
    if (cached) setCacheUid(cached.id);
    return cached;
  });
  /** Bumps when auth is set from Google so a stale boot /me 401 cannot wipe it. */
  const authEpoch = useRef(0);

  function setUser(next: User | null): void {
    authEpoch.current += 1;
    if (!next) {
      resetPrivateCache();
      writeQuery(SESSION_UID, queryKeys.me, null);
      setUserState(null);
      return;
    }
    setCacheUid(next.id);
    writeQuery(SESSION_UID, queryKeys.me, next);
    setUserState(next);
  }

  useEffect(() => {
    const next = syncPortalFromPath(location.pathname);
    setPortal((prev) => {
      if (prev === next) return prev;
      authEpoch.current += 1;
      setUserState(null);
      writeQuery(SESSION_UID, queryKeys.me, null);
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    const epoch = authEpoch.current;
    const meKey = `${queryKeys.me}:${portal}`;
    void (async () => {
      await ensureCsrf();
      if (hasOauthHandoffParams()) return;
      try {
        const me = await loadQuery<User>(
          SESSION_UID,
          meKey,
          () => api<User>("/v1/auth/me"),
          { force: true },
        );
        if (epoch !== authEpoch.current) return;
        setCacheUid(me.id);
        writeQuery(SESSION_UID, queryKeys.me, me);
        setUserState(me);
      } catch {
        if (epoch !== authEpoch.current) return;
        resetPrivateCache();
        writeQuery(SESSION_UID, queryKeys.me, null);
        setUserState(null);
      }
    })();
  }, [portal]);

  return (
    <SnackbarProvider>
      <EventProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PortalChrome brandTo="/guest" brandEvent={false}>
                <AuthPage onAuth={setUser} />
              </PortalChrome>
            }
          />
          <Route
            path="/register"
            element={
              <PortalChrome brandTo="/guest" brandEvent={false}>
                <AuthPage onAuth={setUser} />
              </PortalChrome>
            }
          />
          <Route
            path="/admin"
            element={
              <PortalChrome brandTo="/admin" brandEvent={false}>
                <StaffPage user={user} onAuth={setUser} />
              </PortalChrome>
            }
          />
          <Route
            path="/pass/:publicId"
            element={
              <PortalChrome brandTo="/guest">
                <PassPage />
              </PortalChrome>
            }
          />
          <Route path="/guest" element={<GuestLayout user={user} />}>
            <Route index element={<HomePage />} />
            <Route
              path="tickets"
              element={<TicketsPage user={user} onAuth={setUser} />}
            />
            <Route
              path="account"
              element={
                <AccountPage user={user} onLogout={() => setUser(null)} />
              }
            />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="*" element={<Navigate to="/guest" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/guest" replace />} />
        </Routes>
      </EventProvider>
    </SnackbarProvider>
  );
}
