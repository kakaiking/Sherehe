import { useEffect, useState, type ReactElement, type SVGProps } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, ensureCsrf } from "./api";
import { HomePage } from "./pages/HomePage";
import { TicketsPage } from "./pages/TicketsPage";
import { AuthPage } from "./pages/AuthPage";
import { AccountPage } from "./pages/AccountPage";
import { OrderPage } from "./pages/OrderPage";
import { PartnersPage } from "./pages/PartnersPage";
import { VendorsPage } from "./pages/VendorsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { ShopPage } from "./pages/ShopPage";
import { StaffPage } from "./pages/StaffPage";
import { SnackbarProvider } from "./snackbar";
import { EventProvider } from "./eventContext";
import { WhenWhere } from "./WhenWhere";
import type { UserRole } from "./portal";

export type User = {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  displayName: string | null;
  givenName: string | null;
};

function Icon({
  children,
  ...props
}: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function App(): ReactElement {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void (async () => {
      await ensureCsrf();
      try {
        const me = await api<User>("/v1/auth/me");
        setUser(me);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  return (
    <SnackbarProvider>
      <EventProvider>
      <div className="app-shell">
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="wrap">
          <NavLink className="brand" to="/">
            <span className="brand-mark">Sherehe</span>
            <WhenWhere compact />
          </NavLink>
          <nav className="nav nav-desktop" aria-label="Primary">
            <NavLink to="/tickets">Tickets</NavLink>
            <NavLink to="/shop">Shop</NavLink>
            {user ? (
              <NavLink to="/account">You</NavLink>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="main">
        <div className="wrap">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tickets" element={<TicketsPage user={user} onAuth={setUser} />} />
            <Route path="/login" element={<AuthPage onAuth={setUser} />} />
            <Route path="/register" element={<AuthPage onAuth={setUser} />} />
            <Route
              path="/account"
              element={<AccountPage user={user} onLogout={() => setUser(null)} />}
            />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/partners" element={<PartnersPage user={user} />} />
            <Route path="/vendors" element={<VendorsPage user={user} onAuth={setUser} />} />
            <Route path="/services" element={<ServicesPage user={user} onAuth={setUser} />} />
            <Route path="/shop" element={<ShopPage user={user} onAuth={setUser} />} />
            <Route path="/staff" element={<StaffPage user={user} />} />
          </Routes>
        </div>
      </main>
      <nav className="dock" aria-label="Main">
        <NavLink to="/" end>
          <Icon>
            <path d="M4 11 12 4l8 7" />
            <path d="M6 10.5V20h12v-9.5" />
          </Icon>
          Home
        </NavLink>
        <NavLink to="/tickets">
          <Icon>
            <rect x="3" y="7" width="18" height="10" rx="2" />
            <path d="M8 7v10M16 7v10" />
          </Icon>
          Tickets
        </NavLink>
        <NavLink to="/shop">
          <Icon>
            <path d="M6 7h12l-1 12H7L6 7Z" />
            <path d="M9 7V6a3 3 0 0 1 6 0v1" />
          </Icon>
          Shop
        </NavLink>
        <NavLink to={user ? "/account" : "/login"}>
          <Icon>
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5 19c1.4-3.2 3.8-5 7-5s5.6 1.8 7 5" />
          </Icon>
          {user ? "You" : "Sign in"}
        </NavLink>
      </nav>
      </div>
      </EventProvider>
    </SnackbarProvider>
  );
}
