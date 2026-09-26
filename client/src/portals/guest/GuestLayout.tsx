import type { ReactElement } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { User } from "../../App";
import { NavIcon } from "../NavIcon";
import { PortalChrome } from "../PortalChrome";

export function GuestLayout({
  user,
}: {
  user: User | null;
}): ReactElement {
  const { pathname } = useLocation();
  const onHome = pathname === "/guest" || pathname === "/guest/";

  return (
    <PortalChrome
      brandTo="/guest"
      header={onHome ? "desktop" : true}
      desktopNav={
        <nav className="nav nav-desktop" aria-label="Primary">
          <NavLink to="/guest" end>
            Home
          </NavLink>
          <NavLink to="/guest/tickets">Tickets</NavLink>
          <NavLink to="/guest/partners">Partners</NavLink>
          {user ? <NavLink to="/guest/account">You</NavLink> : null}
        </nav>
      }
      dock={
        <nav className="dock" aria-label="Main">
          <NavLink to="/guest" end>
            <NavIcon>
              <path d="M4 11 12 4l8 7" />
              <path d="M6 10.5V20h12v-9.5" />
            </NavIcon>
            Home
          </NavLink>
          <NavLink to="/guest/tickets">
            <NavIcon>
              <rect x="3" y="7" width="18" height="10" rx="2" />
              <path d="M8 7v10M16 7v10" />
            </NavIcon>
            Tickets
          </NavLink>
          <NavLink to="/guest/partners">
            <NavIcon>
              <path d="M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
              <path d="M16 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M2.5 20c.7-3 2.8-4.8 5.5-4.8S13 17 13.7 20" />
              <path d="M14 20c.5-2.2 2-3.5 4-3.5s3.5 1.3 4 3.5" />
            </NavIcon>
            Partners
          </NavLink>
          {user ? (
            <NavLink to="/guest/account">
              <NavIcon>
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 19c1.4-3.2 3.8-5 7-5s5.6 1.8 7 5" />
              </NavIcon>
              You
            </NavLink>
          ) : null}
        </nav>
      }
    >
      <Outlet />
    </PortalChrome>
  );
}
