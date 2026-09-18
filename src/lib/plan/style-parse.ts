/**
 * Turns the free-text style descriptions used in the rough sewing plan into a
 * clean style code, merchant name and buyer/division code.
 *
 * Examples handled:
 *   "STYLE#D62562/803791(MIDHUN)'Sum'26-ONG-"  -> D62562-803791 / Midhun / ONG
 *   "S#898738/D86746 (Masud)'Sum'26"           -> 898738-D86746 / Masud
 *   "STYLE# 859942 BRFS W ( Shrijit )"         -> 859942 / Shrijit
 *   "P.O:TBA  QTY: 25514 Pcs DL: 03/12"        -> continuation row (no style)
 */

export type ParsedStyle = {
  style: string;
  merchant: string;
  buyer: string;
  /** order quantity found on a P.O / QTY continuation row */
  qty: number;
};

const DIVISION_CODES = [
  "AOB",
  "ONG",
  "ONM",
  "ONB",
  "GOB",
  "GOM",
  "GOW",
  "AOM",
  "AOW",
  "BOB",
  "BOM",
];

const MERCHANT_BUYER: Record<string, string> = {
  midhun: "ONG",
  masud: "ONM",
  suraj: "ONB",
  shrijit: "Brfs - Men",
  venkatsh: "Lager",
  venkatesh: "Lager",
  russel: "AOB",
  jiban: "Lager",
  tushar: "AOB",
  sohag: "AOB",
};

export function isContinuationRow(raw: string): boolean {
  const t = raw.trim().toUpperCase();
  if (!t) return true;
  return (
    t.startsWith("P.O") ||
    t.startsWith("PO:") ||
    t.startsWith("QTY") ||
    t.startsWith("VMI") ||
    t.startsWith("SEWING BALANCE") ||
    t.startsWith("FAB ") ||
    t.startsWith("DL:")
  );
}

/** Pulls every "QTY: 1234" style number out of a continuation row. */
export function extractQty(raw: string): number {
  const text = raw.replace(/\s+/g, " ");
  const marker = /QTY\s*:?\s*([\d,\s+]+)/gi;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text))) {
    for (const part of m[1]!.split(/[+,]/)) {
      const n = Number(part.replace(/\s/g, ""));
      if (Number.isFinite(n) && n > 0) total += n;
    }
  }
  if (total === 0) {
    const balance = /balance\s*-?\s*(\d+)/i.exec(text);
    if (balance) total = Number(balance[1]);
    const vmi = /VMI\s*-?\s*(\d+)/i.exec(text);
    if (!total && vmi) total = Number(vmi[1]);
  }
  return total;
}

function titleCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseStyleText(raw: string): ParsedStyle | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || isContinuationRow(text)) return null;

  // merchant sits in parentheses
  let merchant = "";
  const paren = /\(([^)]+)\)/.exec(text);
  if (paren) {
    const inner = paren[1]!.trim();
    if (!/^\d+$/.test(inner)) merchant = titleCase(inner);
  }

  // buyer / division suffix like -ONG- or -GOB-
  let buyer = "";
  const upper = text.toUpperCase();
  for (const code of DIVISION_CODES) {
    if (new RegExp(`[-\\s]${code}\\b`).test(upper)) {
      buyer = code;
      break;
    }
  }
  if (!buyer && merchant) buyer = MERCHANT_BUYER[merchant.toLowerCase()] ?? "";

  // style code
  let body = text;
  const marker = /(?:STYLE\s*(?:NO|#|:)?|S\s*#)\s*/i.exec(body);
  if (marker) body = body.slice(marker.index + marker[0].length);
  body = body.replace(/\([^)]*\)/g, " ");
  body = body.replace(/'[^']*'\s*\d*/g, " ");
  body = body.trim();

  const token = /^([A-Za-z0-9]+(?:\s*\/\s*[A-Za-z0-9]+)*)/.exec(body);
  let style = "";
  if (token) {
    style = token[1]!
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .join("-");
  }

  // descriptive styles with no code (New Classic, Slimmy, Rookies, USPOLO...)
  if (!style || /^[-\s]*$/.test(style)) {
    style = body.replace(/[^A-Za-z0-9\- ]/g, " ").trim().split(/\s{2,}/)[0] ?? "";
  }
  style = style.replace(/[-\s]+$/g, "").trim();

  // keep a short descriptive tail such as "BRFS W" out of the code
  if (/^\d+$/.test(style) || /^[A-Z]+\d/i.test(style)) {
    style = style.toUpperCase();
  }

  if (!style) return null;
  return { style, merchant, buyer, qty: 0 };
}
