import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { PageHead } from "../flow/PageHead";

export function PrivacyPage(): ReactElement {
  return (
    <>
      <PageHead title="Privacy" lede="How Sherehe handles your data for this event." />
      <article className="legal-copy">
        <p>
          Food With Walter Kenya runs Sherehe as a single-event ticketing site.
          We collect only what we need to sell tickets, take M-Pesa payment, and
          check you in at the gate.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Google account identity (email, name, Google subject id) when you sign in.</li>
          <li>Kenyan mobile number you enter for the M-Pesa STK Push prompt.</li>
          <li>Order, payment, and ticket records (amounts, M-Pesa receipt refs, QR pass ids).</li>
          <li>Session cookies and a CSRF cookie to keep you signed in securely.</li>
        </ul>
        <h2>How we use it</h2>
        <ul>
          <li>Authenticate you and show your ticket records.</li>
          <li>Send the M-Pesa payment prompt and fulfill paid tickets.</li>
          <li>Issue PDF stubs and signed pass URLs for gate scan.</li>
          <li>Let staff check attendance and refund unused tickets when needed.</li>
        </ul>
        <h2>Sharing</h2>
        <p>
          Payment prompts go through Safaricom Daraja. Sign-in goes through Google.
          Hosting runs on Vercel with Postgres (Neon) and Redis (Upstash). We do not
          sell your data.
        </p>
        <h2>Retention</h2>
        <p>
          Account and ticket records are kept for the event and reasonable
          bookkeeping afterward. You can ask the organizer about deletion of your
          guest account after the night.
        </p>
        <p className="lede">
          Questions: contact the organizer via the staff email used for this
          deployment. Also see <Link to="/terms">Terms</Link>.
        </p>
      </article>
    </>
  );
}

export function TermsPage(): ReactElement {
  return (
    <>
      <PageHead title="Terms" lede="Ticket rules for Sherehe at Fused Lens Studios." />
      <article className="legal-copy">
        <p>
          Buying a ticket is an agreement with Food With Walter Kenya for entry to
          Sherehe on the published date and venue. Tickets are personal; resale may
          be refused at the gate.
        </p>
        <h2>Payment</h2>
        <p>
          Prices are in Kenyan shillings. Payment is by M-Pesa STK Push. A ticket
          is issued only after payment is confirmed. Mock mode is for testing only
          and never takes real money.
        </p>
        <h2>Entry</h2>
        <p>
          Bring the PDF stub or the signed pass URL. Staff may scan and mark a
          ticket used. Already-used or void tickets are not valid for entry.
        </p>
        <h2>Refunds</h2>
        <p>
          Unused tickets may be refunded by staff before they are scanned. Money
          returned on live M-Pesa is completed through Daraja / Safaricom processes.
          Scanned tickets are not refundable through the app.
        </p>
        <h2>Changes</h2>
        <p>
          The organizer may update venue details, sale windows, or these terms if
          the event requires it. Continued use after a change means you accept the
          update.
        </p>
        <p className="lede">
          Also see <Link to="/privacy">Privacy</Link>.
        </p>
      </article>
    </>
  );
}
