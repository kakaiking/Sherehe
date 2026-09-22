import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { ensureCsrf, parseJsonBody, type ApiError } from "../../api";
import { LinesSkeleton } from "../../cache/Skeleton";
import { queryKeys } from "../../cache/queryCache";
import { useApiQuery } from "../../cache/useCachedQuery";
import { PORTAL_HEADER, readStoredPortal } from "../../portal";
import {
  parseTicketScanPayload,
  type TicketScanPayload,
} from "../../tickets/parseScanPayload";

type ScanOutcome =
  | "admitted"
  | "already_used"
  | "void"
  | "invalid"
  | "error";

type ScanResult = {
  outcome: ScanOutcome;
  detail: string;
  label?: string;
  holderName?: string;
  eventName?: string;
  usedAt?: string | null;
};

type ScanHistoryRow = {
  publicId: string;
  code: string;
  label: string;
  holderName: string;
  usedAt: string;
};

type ScanHistory = { scans: ScanHistoryRow[] };

const HISTORY_PAGE_SIZE = 10;

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const w = window as Window & { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

function formatScanTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

async function postScan(payload: TicketScanPayload): Promise<ScanResult> {
  const headers = new Headers({
    "content-type": "application/json",
    [PORTAL_HEADER]: readStoredPortal(),
    "x-csrf-token": await ensureCsrf(),
  });
  const res = await fetch("/v1/staff/tickets/scan", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  const body = (await parseJsonBody(res)) as Record<string, unknown> | null;
  const detail =
    body && typeof body["detail"] === "string"
      ? body["detail"]
      : res.ok
        ? "Valid — admit guest."
        : "Scan failed.";
  const outcomeRaw =
    body && typeof body["outcome"] === "string" ? body["outcome"] : null;

  let outcome: ScanOutcome = "error";
  let resultDetail = detail;
  if (res.ok || outcomeRaw === "admitted") {
    outcome = "admitted";
    resultDetail = res.ok ? "Valid — admit guest." : detail;
  } else if (outcomeRaw === "already_used") {
    outcome = "already_used";
  } else if (outcomeRaw === "void") {
    outcome = "void";
  } else if (outcomeRaw === "invalid") {
    outcome = "invalid";
  } else if (res.status === 409) {
    outcome = detail.toLowerCase().includes("void") ? "void" : "already_used";
  } else if (res.status === 400 || res.status === 404 || res.status === 422) {
    outcome = "invalid";
  }

  const result: ScanResult = { outcome, detail: resultDetail };
  if (body && typeof body["label"] === "string") result.label = body["label"];
  if (body && typeof body["holderName"] === "string") {
    result.holderName = body["holderName"];
  }
  if (body && typeof body["eventName"] === "string") {
    result.eventName = body["eventName"];
  }
  if (body && typeof body["usedAt"] === "string") result.usedAt = body["usedAt"];
  else if (body && body["usedAt"] === null) result.usedAt = null;
  return result;
}

export function TicketScanDesk({ uid }: { uid: string }): ReactElement {
  const historyId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRawRef = useRef<string>("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraHint, setCameraHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const historyQ = useApiQuery<ScanHistory>(
    queryKeys.staffScans,
    "/v1/staff/tickets/scans",
    { enabled: true, uid, freshMs: 0 },
  );

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!cameraOn) return;
    const Detector = barcodeDetectorCtor();
    if (!Detector) {
      setCameraHint(
        "This browser cannot decode live QR codes. Use Chrome or Edge on Android.",
      );
      return;
    }
    const detector = new Detector({ formats: ["qr_code"] });
    let cancelled = false;
    const tick = window.setInterval(() => {
      void (async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || busy) return;
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue?.trim();
          if (!raw || raw === lastRawRef.current) return;
          lastRawRef.current = raw;
          await submitRaw(raw);
        } catch {
          /* keep polling */
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      void cancelled;
    };
  }, [cameraOn, busy]);

  function stopCamera(): void {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  async function startCamera(): Promise<void> {
    setCameraHint(null);
    setResult(null);
    lastRawRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setCameraOn(true);
      if (!barcodeDetectorCtor()) {
        setCameraHint(
          "Camera is on, but this browser cannot decode QR codes. Use Chrome or Edge on Android.",
        );
      }
    } catch {
      setCameraHint("Could not open the camera. Check permissions.");
      stopCamera();
    }
  }

  async function submitRaw(raw: string): Promise<void> {
    const payload = parseTicketScanPayload(raw);
    if (!payload) {
      setResult({
        outcome: "invalid",
        detail: "Could not read a Sherehe pass from that scan.",
      });
      return;
    }
    setBusy(true);
    try {
      const next = await postScan(payload);
      setResult(next);
      if (next.outcome === "admitted") {
        await historyQ.reload();
      }
    } catch (err) {
      setResult({
        outcome: "error",
        detail: (err as ApiError).detail ?? "Scan failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const tone =
    result?.outcome === "admitted"
      ? "ok"
      : result?.outcome === "already_used"
        ? "used"
        : result
          ? "bad"
          : null;

  const scans = historyQ.data?.scans ?? [];
  const pageCount = Math.max(1, Math.ceil(scans.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(historyPage, pageCount - 1);
  const pageStart = safePage * HISTORY_PAGE_SIZE;
  const pageScans = scans.slice(pageStart, pageStart + HISTORY_PAGE_SIZE);
  const rangeStart = scans.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + HISTORY_PAGE_SIZE, scans.length);

  function refreshHistory(): void {
    setHistoryPage(0);
    void historyQ.reload();
  }

  return (
    <div className="ticket-scan">
      <div className="ticket-scan-camera">
        <video
          ref={videoRef}
          className="ticket-scan-video"
          muted
          playsInline
          aria-label="Ticket scanner camera"
        />
        {!cameraOn ? (
          <p className="ticket-scan-camera-idle">Camera off</p>
        ) : null}
      </div>
      <p className="staff-actions">
        {cameraOn ? (
          <button type="button" className="secondary" onClick={stopCamera}>
            Stop camera
          </button>
        ) : (
          <button type="button" onClick={() => void startCamera()}>
            Start camera
          </button>
        )}
      </p>
      {cameraHint ? <p className="status">{cameraHint}</p> : null}

      {result && tone ? (
        <article
          className={`pass-result pass-result-${tone} ticket-scan-result`}
          role="status"
          aria-live="polite"
        >
          <p className="pass-result-stamp">
            {result.outcome === "admitted"
              ? "Valid"
              : result.outcome === "already_used"
                ? "Already used"
                : result.outcome === "void"
                  ? "Void"
                  : "Not valid"}
          </p>
          <h2>
            {result.outcome === "admitted"
              ? "Admit guest"
              : result.outcome === "already_used"
                ? "Already checked in"
                : "Do not admit"}
          </h2>
          <p className="lede">{result.detail}</p>
          {result.label || result.holderName ? (
            <div className="pass-result-card">
              {result.label ? (
                <p className="pass-result-label">{result.label}</p>
              ) : null}
              {result.holderName ? (
                <p className="pass-result-holder">{result.holderName}</p>
              ) : null}
              {result.eventName ? (
                <p className="admin-record-meta">{result.eventName}</p>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      <section className="ticket-scan-history" aria-labelledby={historyId}>
        <div className="admin-record-head">
          <h2 id={historyId}>History</h2>
          <button
            type="button"
            className="ticket-scan-icon-btn"
            aria-label="Refresh history"
            onClick={refreshHistory}
            disabled={historyQ.refreshing}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
              />
            </svg>
          </button>
        </div>
        <div className="ticket-scan-history-body">
          {historyQ.loading && !historyQ.data ? (
            <LinesSkeleton lines={4} label="Loading history" />
          ) : null}
          {historyQ.error ? (
            <p className="error" role="alert">
              {historyQ.error}
            </p>
          ) : null}
          {!historyQ.loading && scans.length === 0 ? (
            <p className="status">No tickets checked in yet.</p>
          ) : null}
          {pageScans.length > 0 ? (
            <ul className="staff-list ticket-scan-history-list">
              {pageScans.map((row) => (
                <li key={row.publicId}>
                  <div className="admin-record-head">
                    <strong>{row.holderName}</strong>
                    <span className="admin-pill status-paid">Used</span>
                  </div>
                  <p className="admin-record-meta">
                    {row.label} · {formatScanTime(row.usedAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {scans.length > 0 ? (
          <div className="ticket-scan-history-pager">
            <span className="admin-record-meta" aria-live="polite">
              {rangeStart}-{rangeEnd} of {scans.length}
            </span>
            <button
              type="button"
              className="ticket-scan-icon-btn"
              aria-label="Previous history page"
              disabled={safePage <= 0}
              onClick={() => setHistoryPage(safePage - 1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 5 8 12l7 7"
                />
              </svg>
            </button>
            <button
              type="button"
              className="ticket-scan-icon-btn"
              aria-label="Next history page"
              disabled={safePage >= pageCount - 1}
              onClick={() => setHistoryPage(safePage + 1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m9 5 7 7-7 7"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
