# Changelog

All notable changes to Sherehe are documented in this file.

## Unreleased

### Changed

- Product is **tickets only**: Guest (`/guest`) and Admin (`/admin`). Partner and Vendor portals, shop, and services are removed from the client; `/v1/partners`, `/v1/vendors`, and `/v1/commerce` are no longer mounted. Session gates are `user` | `admin` only.
- Guest chrome is Home / Tickets, plus **You** only when signed in. Signed-out visitors see no Sign in in the nav or dock — Google sign-in starts when they pick a ticket. Sign-in is Guest-only (no Partner/Vendor picker). Admin dock is Dashboard / Tickets / Scan.
- Portals own independent URL trees: `/guest/*` and `/admin`, plus shared `/login`. Bare or unknown paths (`/`, `/shop`, `/tickets`, `/partner`, `/vendor`, …) redirect to `/guest`.

### Added

- **Gate scan** on admin (`Scan` desk): camera or paste checks a ticket and marks it used. The desk lists **scan history** (recent check-ins). Guest phone-camera scans open `/pass/:id` with a meaningful Valid / Already checked in / Void screen — that page never consumes the pass.
- Ticket QR codes encode a signed pass URL (`/pass/{publicId}?sig=…`) instead of opaque JSON, so any camera app lands on the pass page.
### Fixed

- `./start.sh` opens `/guest` (bare `/` also lands there via redirect).
- Google sign-in no longer fails with a generic error when the API host clock is hours ahead of real time. id_token expiry uses Google's HTTP `Date`, and a drifted clock surfaces a clear “fix the date and time” message instead of “did not complete.”
- User-gate Google return no longer paints “Confirming admin access…” — that shell only shows when PKCE was started from `/admin`. Sticky admin confirming is cleared when starting a guest Google sign-in.
- Admin has its own session cookie (`sherehe_sid_admin`). Signing in on `/admin` no longer owns guest You/Home; leaving admin resets the active gate to Guest. Staff API routes require the admin cookie.
- Admin brand and back control stay on `/admin` (no jump to guest Home / You). Guest desktop nav is hidden on the admin portal.

### Changed

- Sign-in gate label **User** is now **Guest**. Wire id stays `user` (cookie `sherehe_sid_user`, `account_kind`).
- Site brand (Sherehe + when/where) is centered in the header on every page; page titles stay centered with the back control overlaid on the left.
- Admin is reached only by opening `/admin` (no Admin shortcut from Guest You or other portals).
- Admin **Ticket orders** opens a buyers-only list. Flash sale and product stock stay on the **Event** desk, opened from the Attendees card (not a dock tab).

### Fixed

- Production catalog boot no longer re-runs `001_init.sql` after it is applied. That re-run created `account_kind` indexes on the old `sessions`/`orders` tables and crashed every `/v1` request (`FUNCTION_INVOCATION_FAILED`). Indexes on `account_kind` in `001` now no-op if the column is missing; a rejected Vercel boot is retried instead of cached; CI replays the frozen pre-portal schema. The client ignores non-JSON error bodies instead of `JSON.parse` throwing.

### Added

- GET lists (home, tickets, account, orders, staff) paint from a localStorage snapshot and only hit Postgres again when that copy is missing or older than 45 seconds in memory. Cold visits use skeleton placeholders; sign-out keeps the public catalog cache.
- `./push.sh "commit message"` stages the tree, commits, pushes `origin`, and deploys Vercel production.
- Tab icon is a tight beer-pong cup mark drawn to read at 16px (`/favicon.svg`, plus PNG/ICO fallbacks).

### Changed

- The Kenyan mobile is entered on **Receive Prompt** (tickets), not on a post-Google **Your mobile** page. Google sign-in continues even when the account has no number yet.
- Persistence is **Postgres** (Neon in production, Compose locally on host port **5433**). Hosting target is **Vercel** (static client + `/api` Express). **Upstash Redis** is required in production for rate limits and migrate locks.

### Removed

- Partner and Vendor portals, guest shop, vendor stall CRUD, partner registration, and free partner ticket claims from the product surface.
- The dock **More** sheet (Partners / Vendors).

### Fixed

- Production Google sign-in no longer 404s on `/login`: Vercel now serves `index.html` for SPA routes after `/v1` and `/health`.

- The paid-order ticket preview stacks night, studio, locality, then the holder line like the PDF stub, instead of overlapping the compact venue line with the name.

- Google sign-in no longer depends on an OAuth state cookie set on a 302 bounce to Google (Firefox was dropping it as `google_state`). The SPA starts PKCE in sessionStorage; the GET callback hands the code to `/login` and a CSRF-protected POST finishes the exchange.

- Shop checkout no longer crashes (`error is not defined`) after picking a meal.

### Changed

- Bottom dock is **Home, Tickets, Shop, You** on every portal. Desktop header matches. Staff is on You.
- The night is **Saturday 28 November 2026** at **Fused Lens Studios, Kirigiti, Kiambu**. Catalog, vendor set-up times, ticket stubs (on-screen and PDF), and the header calendar strip all read from that fact. Guest UI shows the date, not a doors clock.

### Added

- Google sign-in requests the profile scope and stores the guest's name. The account page shows that name above email and phone. Each stub writes the buyer name on the dashed line under the QR (`{first name}'s group` on a group pass).
- Downloading a paid ticket PDF stamps `stub_downloaded_at` on the order. A later **Receive Prompt** asks **Are you sure you want another ticket?** before a second STK. Checkout opens **Shop** immediately; the PDF saves in the background and a success snackbar confirms it there.
- Ticket checkout is four steps: pick, quantity, pay with M-Pesa (Daraja STK Push to the number entered on **Receive Prompt**), then download a charcoal pit PDF stub (wordmark, pass name, QR — no order ids on the face). Live Daraja uses a cached OAuth token, STK Query polling, Nairobi timestamps, and refuses to start without HTTPS callback credentials.

### Fixed

- Google sign-in failures redirect with an allowlisted `error` code (`google_off`, `google_denied`, `google_state`, `google_conflict`, `google_network`) instead of a single generic `error=google`. The login page maps those codes to copy and ignores unknown query values.

- Vendor package cards use a stall-chit layout: category, name and fee, then labeled set-up, hours, and pay-by, with rules underneath.

- Account history lists the ticket bought and the Nairobi date/time of the purchase, not `kind · paid`.
- A group package issues one gate QR (still five seats for capacity), not five stubs.
- M-Pesa pay shows the chosen ticket as centered copy (`Early Bird × 1`), not a labeled input. Form field values are centered across the app.
- Ticket quantity step footer is **Pay** (then **Receive Prompt** on the M-Pesa step).
- Ticket pay no longer asks to confirm the saved M-Pesa number; the footer is **Receive Prompt**.
- Successful sign-in lands on **Home** unless a checkout pick is saved to resume. Completed sign-in, sign-out, phone save, checkout, partner registration, and staff reviews show a snackbar under the site header.
- Sign out leaves **Account** for guest **Home** (not the Sign in screen).

- Kenyan mobile fields lock **+254** as a prefix chip, space the remaining 9 digits as `712 345 678`, and refuse extra digits.

- Page copy sits in a centered reading column on every route (home keeps the two-column poster).
- The group pass is labeled **Group Ticket (5 people)** (no extra “seats” suffix).
- Ticket, shop, vendor, service, and partner flows are stepped. Tickets add M-Pesa pay (step 3) and a PDF stub (step 4). Other catalogs stay pick-then-details. The choice is read-only after it is made; a left-arrow back control beside the step line returns to the previous page (the pick list on later steps, or the prior route on step one). Sign-in, account, order, and staff screens use the same control.
- A signed-out choice on step one continues after **Continue with Google** instead of dumping the visitor on the account page.
- Sign-in is Google OAuth only (email/password form removed from the UI). A Kenyan mobile is collected when the guest requests the M-Pesa prompt.

### Removed

- Tickets page lede copy about Monday plates.

### Added

- `./start.sh` — frees ports **5173** and **8787** if needed, brings up Postgres, runs migrations, starts the API and Vite dev servers, opens http://localhost:5173, and writes process logs under `.local/state/sherehe-dev/`.
- Public ticket catalog with server-side sale windows, group packages (5 seats), and a flash-sale gate that refuses sales at or above 200 attendees.
- M-Pesa STK Push checkout (mock locally, Daraja live when configured) with inventory holds and QR ticket stubs.
- Partner/sponsor applications with staff confirm/reject.
- Vendor packages, rules, payment deadline, and fee checkout.
- Catering/service bookings and a small product shop on the same payment primitive.
- Customer accounts (Google + Kenyan phone) and a staff sales console.
- Minimalist system light/dark UI (no theme toggle).
