import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatPdfEventDay } from "./eventLine.js";
import { EVENT_STARTS_AT } from "../eventFacts.js";
import { fontDir } from "./fonts.js";

export type ProductReceiptInput = {
  title: string;
  qty: number;
  totalKsh: number;
  holderName: string;
  mpesaReceipt: string | null;
  paidAt: Date | null;
};

const PAGE_W = 324;
const PAGE_H = 512;
const pit = rgb(20 / 255, 8 / 255, 6 / 255);
const bark = rgb(36 / 255, 17 / 255, 12 / 255);
const cream = rgb(255 / 255, 244 / 255, 234 / 255);
const ember = rgb(255 / 255, 90 / 255, 31 / 255);
const coal = rgb(255 / 255, 210 / 255, 63 / 255);
const FONT_DIR = fontDir(import.meta.url);

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

/**
 * Charcoal chit for a paid plate: name, quantity, amount, optional M-Pesa
 * receipt. No order UUIDs on the face.
 */
export async function productReceiptPdf(
  input: ProductReceiptInput,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const display = await doc.embedFont(
    readFileSync(join(FONT_DIR, "Bungee-Regular.ttf")),
  );
  const body = await doc.embedFont(readFileSync(join(FONT_DIR, "Sora-Variable.ttf")));
  const page = doc.addPage([PAGE_W, PAGE_H]);
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

  const brand = "SHEREHE";
  page.drawText(brand, {
    x: centerX(brand, display, 22),
    y: PAGE_H - 78,
    size: 22,
    font: display,
    color: cream,
  });
  const tag = "plate receipt";
  page.drawText(tag, {
    x: centerX(tag, body, 9),
    y: PAGE_H - 98,
    size: 9,
    font: body,
    color: ember,
  });

  drawCenteredFitted(
    page,
    input.title.toUpperCase(),
    display,
    16,
    PAGE_H - 160,
    coal,
    PAGE_W - 48,
  );
  drawCenteredFitted(
    page,
    `× ${input.qty}`,
    body,
    14,
    PAGE_H - 188,
    cream,
    PAGE_W - 48,
  );
  drawCenteredFitted(
    page,
    `${input.totalKsh} KES`,
    display,
    18,
    PAGE_H - 240,
    cream,
    PAGE_W - 48,
  );

  const when = formatPdfEventDay(input.paidAt ?? EVENT_STARTS_AT).toUpperCase();
  drawCenteredFitted(page, when, body, 9, 160, coal, PAGE_W - 72);
  drawCenteredFitted(page, input.holderName, body, 11, 136, cream, PAGE_W - 80);
  if (input.mpesaReceipt) {
    drawCenteredFitted(
      page,
      input.mpesaReceipt,
      body,
      9,
      112,
      ember,
      PAGE_W - 72,
    );
  }

  const footer = "KEEP THIS CHIT";
  page.drawText(footer, {
    x: centerX(footer, body, 10),
    y: 72,
    size: 10,
    font: body,
    color: cream,
  });

  return Buffer.from(await doc.save());
}
