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
  /**
   * Sticky brand bar. `true` always; `false` never; `"desktop"` only from
   * the 768px breakpoint (guest home keeps the bottom dock on small screens).
   */
  header?: boolean | "desktop";
  desktopNav?: ReactNode;
  dock?: ReactNode;
  children: ReactNode;
}): ReactElement {
  const headerClass =
    header === "desktop"
      ? "site-header site-header--desktop-only"
      : "site-header";

  return (
    <div className={dock ? "app-shell" : "app-shell app-shell--no-dock"}>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      {header ? (
        <header className={headerClass}>
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
