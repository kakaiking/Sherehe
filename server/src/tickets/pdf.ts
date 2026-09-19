import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ticketLabel } from "./label.js";
import { formatPdfEventDay, venueHall, venueLocality } from "./eventLine.js";
import { EVENT_STARTS_AT, EVENT_VENUE } from "../eventFacts.js";
import { fontDir } from "./fonts.js";

export type TicketPdfInput = {
  publicId: string;
  qrDataUrl: string;
  code: string;
  holderName: string;
};

export type TicketPdfEvent = {
  venue: string;
  startsAt: Date;
};

const PAGE_W = 324;
const PAGE_H = 512;

const pit = rgb(20 / 255, 8 / 255, 6 / 255);
const bark = rgb(36 / 255, 17 / 255, 12 / 255);
const cream = rgb(255 / 255, 244 / 255, 234 / 255);
const ember = rgb(255 / 255, 90 / 255, 31 / 255);
const coal = rgb(255 / 255, 210 / 255, 63 / 255);
const plate = rgb(1, 1, 1);

const FONT_DIR = fontDir(import.meta.url);

function pngBytesFromDataUrl(dataUrl: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("qr_not_png");
  }
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

function centerX(text: string, font: PDFFont, size: number): number {
  return (PAGE_W - font.widthOfTextAtSize(text, size)) / 2;
}

function drawCenteredFitted(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  color: ReturnType<typeof rgb>,
  maxWidth: number,
): void {
  let s = size;
  let t = text;
  while (s > 8 && font.widthOfTextAtSize(t, s) > maxWidth) {
    s -= 0.5;
  }
  if (font.widthOfTextAtSize(t, s) > maxWidth) {
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, s) > maxWidth) {
      t = t.slice(0, -1);
    }
    t = `${t}…`;
  }
  page.drawText(t, {
    x: centerX(t, font, s),
    y,
    size: s,
    font,
    color,
  });
}

function drawStubChrome(page: PDFPage): void {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: pit });
  page.drawRectangle({
    x: 10,
    y: 10,
    width: PAGE_W - 20,
    height: PAGE_H - 20,
    color: bark,
    borderColor: cream,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 10,
    y: 10,
    width: 7,
    height: PAGE_H - 20,
    color: ember,
  });
  const tickY = PAGE_H - 36;
  for (let x = 28; x < PAGE_W - 24; x += 16) {
    page.drawRectangle({
      x,
      y: tickY,
      width: 10,
      height: 3,
      color: coal,
    });
  }
}

/**
 * One charcoal pit stub per ticket: wordmark, pass name, QR plate,
 * night and studio, signature line.
 */
export async function ticketsPdf(
  tickets: TicketPdfInput[],
  event: TicketPdfEvent = { venue: EVENT_VENUE, startsAt: EVENT_STARTS_AT },
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const display = await doc.embedFont(
    readFileSync(join(FONT_DIR, "Bungee-Regular.ttf")),
  );
  const body = await doc.embedFont(readFileSync(join(FONT_DIR, "Sora-Variable.ttf")));

  for (const ticket of tickets) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawStubChrome(page);

    const brand = "SHEREHE";
    const brandSize = 22;
    page.drawText(brand, {
      x: centerX(brand, display, brandSize),
      y: PAGE_H - 78,
      size: brandSize,
      font: display,
      color: cream,
    });

    const tag = "the pit is open";
    const tagSize = 9;
    page.drawText(tag, {
      x: centerX(tag, body, tagSize),
      y: PAGE_H - 98,
      size: tagSize,
      font: body,
      color: ember,
    });

    const name = ticketLabel(ticket.code).toUpperCase();
    const nameSize = 16;
    page.drawText(name, {
      x: centerX(name, display, nameSize),
      y: PAGE_H - 136,
      size: nameSize,
      font: display,
      color: coal,
    });

    const png = await doc.embedPng(pngBytesFromDataUrl(ticket.qrDataUrl));
    const plateSize = 204;
    const qrSize = 168;
    const plateX = (PAGE_W - plateSize) / 2;
    const plateY = 168;
    const radius = 16;
    page.drawRectangle({
      x: plateX + radius,
      y: plateY,
      width: plateSize - radius * 2,
      height: plateSize,
      color: plate,
    });
    page.drawRectangle({
      x: plateX,
      y: plateY + radius,
      width: plateSize,
      height: plateSize - radius * 2,
      color: plate,
    });
    for (const cx of [plateX + radius, plateX + plateSize - radius]) {
      for (const cy of [plateY + radius, plateY + plateSize - radius]) {
        page.drawCircle({ x: cx, y: cy, size: radius, color: plate });
      }
    }
    page.drawImage(png, {
      x: plateX + (plateSize - qrSize) / 2,
      y: plateY + (plateSize - qrSize) / 2,
      width: qrSize,
      height: qrSize,
    });

    const holeY = plateY + plateSize / 2;
    for (const holeX of [18, PAGE_W - 18]) {
      page.drawCircle({
        x: holeX,
        y: holeY,
        size: 11,
        color: pit,
        borderColor: cream,
        borderWidth: 2.5,
      });
    }

    const day = formatPdfEventDay(event.startsAt).toUpperCase();
    drawCenteredFitted(page, day, body, 8, 150, coal, PAGE_W - 72);
    const hall = venueHall(event.venue).toUpperCase();
    drawCenteredFitted(page, hall, body, 8, 138, cream, PAGE_W - 72);
    const locality = venueLocality(event.venue);
    if (locality) {
      drawCenteredFitted(
        page,
        locality.toUpperCase(),
        body,
        7,
        126,
        ember,
        PAGE_W - 72,
      );
    }

    page.drawLine({
      start: { x: 36, y: 112 },
      end: { x: PAGE_W - 36, y: 112 },
      thickness: 1.4,
      color: cream,
      opacity: 0.45,
      dashArray: [5, 5],
    });

    drawCenteredFitted(
      page,
      ticket.holderName,
      body,
      11,
      94,
      cream,
      PAGE_W - 80,
    );

    const footer = "GATE SCAN";
    const footerSize = 10;
    page.drawText(footer, {
      x: centerX(footer, body, footerSize),
      y: 72,
      size: footerSize,
      font: body,
      color: cream,
    });
  }

  return Buffer.from(await doc.save());
}
