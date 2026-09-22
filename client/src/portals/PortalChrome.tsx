import type { ReactElement, ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { WhenWhere } from "../WhenWhere";

/** Shared brand + main wrap; each portal owns its nav/dock around this. */
export function PortalChrome({
  brandTo,
  brandEvent = true,
  header = true,
  desktopNav,
  dock,
  children,
}: {
  brandTo: string;
  /** Compact date · venue under the mark. Off on auth gates (login already shows WhenWhere). */
  brandEvent?: boolean;
  /** Sticky brand bar. Off on guest home (hero already carries the mark). */
  header?: boolean;
  desktopNav?: ReactNode;
  dock?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className={dock ? "app-shell" : "app-shell app-shell--no-dock"}>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      {header ? (
        <header className="site-header">
          <div className="wrap">
            <NavLink className="brand" to={brandTo}>
              <span className="brand-mark">Sherehe</span>
              {brandEvent ? <WhenWhere compact /> : null}
            </NavLink>
            {desktopNav}
          </div>
        </header>
      ) : null}
      <main id="main">
        <div className="wrap">{children}</div>
      </main>
      {dock}
    </div>
  );
}
