/**
 * Tolerant field parsers for the free-text cells in the sewing plan.
 *
 * Every parser is defensive: when it is not confident it returns null and the
 * caller raises a flag instead of inventing data. The raw text is never
 * modified — only copies are normalised for matching.
 */
import type { EntryType, Quantity } from "./types";

export function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/* ------------------------------- style --------------------------------- */

export type StyleParts = {
  styleNo: string | null;
  secondaryCode: string | null;
  planner: string | null;
  season: string | null;
  buyer: string | null;
  description: string | null;
};

const BUYER_CODES = [
  "AOB", "AOM", "AOW", "ONG", "ONM", "ONB", "ONW",
  "GOB", "GOM", "GOW", "BOB", "BOM", "BOW",
];

const NON_STYLE_WORDS = new Set([
  "MANUAL", "VMI", "DARK", "WASH", "LT", "MED", "TBA", "PCS", "LINE", "SUPPORT",
]);

export function parseStyle(raw: string): StyleParts {
  const text = squash(raw);
  const empty: StyleParts = {
    styleNo: null,
    secondaryCode: null,
    planner: null,
    season: null,
    buyer: null,
    description: null,
  };
  if (!text) return empty;

  // planner sits in parentheses: (MIDHUN), ( Shrijon)
  let planner: string | null = null;
  const paren = /\(([^)]*)\)/.exec(text);
  if (paren) {
    const inner = squash(paren[1] ?? "");
    if (inner && !/^\d+$/.test(inner)) planner = titleCase(inner);
  }

  // season: 'Sum'26, 'Fall'25, 'AW 25, 'SS25, 'Spr'26
  let season: string | null = null;
  const seasonRe =
    /'?\s*(sum|summer|fall|spr|spring|aw|ss|hol|holl|winter)\s*'?\s*,?\s*(\d{2,4})?/i;
  const sm = seasonRe.exec(text);
  if (sm) season = squash(sm[0]).replace(/^'/, "");

  // buyer / division code, e.g. -ONG- or -GOB-
  let buyer: string | null = null;
  const upper = text.toUpperCase();
  for (const code of BUYER_CODES) {
    if (new RegExp(`[-\\s]${code}(?:[-\\s]|$)`).test(upper)) {
      buyer = code;
      break;
    }
  }

  // style token after STYLE# / S# / STYLE NO
  const marker = /(?:style\s*(?:no\.?|number|#|:)?|s\s*#)\s*/i.exec(text);
  let styleNo: string | null = null;
  let secondaryCode: string | null = null;
  if (marker) {
    const after = text.slice(marker.index + marker[0].length).trim();
    const token = /^([A-Za-z0-9.]+)(?:\s*\/\s*([A-Za-z0-9.]+))?/.exec(after);
    if (token) {
      const first = token[1]!.toUpperCase().replace(/[.]+$/, "");
      const second = token[2]?.toUpperCase().replace(/[.]+$/, "") ?? null;
      if (/\d/.test(first) && !NON_STYLE_WORDS.has(first)) {
        styleNo = first;
        secondaryCode = second;
      } else if (!NON_STYLE_WORDS.has(first)) {
        // descriptive style such as "NEW CLASSIC" or "Rookies"
        const descriptive = /^([A-Za-z][A-Za-z0-9 &-]{1,28})/.exec(after);
        styleNo = descriptive ? squash(descriptive[1]!).toUpperCase() : first;
        secondaryCode = second;
      }
    }
  }

  // trailing free text after the recognised parts
  let description: string | null = null;
  if (styleNo) {
    const tail = text
      .replace(/\([^)]*\)/g, " ")
      .replace(new RegExp(escapeRe(styleNo), "i"), " ")
      .replace(/(?:style\s*(?:no\.?|number|#|:)?|s\s*#)/i, " ");
    const cleaned = squash(tail.replace(/['"\-/]/g, " "));
    if (cleaned && cleaned.length > 1) description = cleaned;
  }

  return { styleNo, secondaryCode, planner, season, buyer, description };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------------- PO ----------------------------------- */

/** Handles P.O: / PO: / P.O. / PO / po, single or comma separated. */
export function parsePo(raw: string): { poNo: string | null; multiple: boolean } {
  const text = squash(raw);
  const m = /\bP\.?\s*O\.?\s*(?:NO\.?)?\s*[:#-]?\s*([A-Za-z0-9]+(?:\s*,\s*[A-Za-z0-9]+)*)/i.exec(
    text,
  );
  if (!m) return { poNo: null, multiple: false };
  const parts = m[1]!
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) return { poNo: null, multiple: false };
  return { poNo: parts.join(","), multiple: parts.length > 1 };
}

/* ------------------------------ quantity -------------------------------- */

/**
 * Collects every quantity in the cell. Comma groupings inside a number
 * ("300,835 Pcs") are ambiguous in this data set — they may be a thousands
 * separator or two separate quantities — so each is returned separately and
 * flagged instead of being silently added up.
 */
export function parseQuantities(raw: string): {
  quantities: Quantity[];
  ambiguous: boolean;
} {
  const text = squash(raw);
  const out: Quantity[] = [];
  let ambiguous = false;

  const re = /(?:qty|quantity|total\s*qty|balance)\s*[:\-]?\s*([0-9][0-9,\s+]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const chunk = m[1]!.trim();
    const parts = chunk.split(/[,+]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) ambiguous = true;
    for (const part of parts) {
      const n = Number(part.replace(/\s/g, ""));
      if (Number.isFinite(n) && n > 0) out.push({ value: n, raw: squash(m[0]) });
    }
  }
  return { quantities: out, ambiguous };
}

/* --------------------------- delivery date ------------------------------ */

export type DeliveryDates = {
  start: string | null;
  end: string | null;
  raw: string | null;
  ambiguous: boolean;
};

/**
 * DL:02/20, DL:02/10-12, DL:03/27-04/02, DL: 6/06, DL:5/31.
 * The year is never printed, so the planning year is supplied by the caller.
 */
export function parseDelivery(raw: string, contextYear: number): DeliveryDates {
  const text = squash(raw);
  const m = /\bD\.?\s*L\.?\s*[:\-]?\s*([0-9/\-–\s]{3,20})/i.exec(text);
  if (!m) return { start: null, end: null, raw: null, ambiguous: false };
  const body = squash(m[1]!).replace(/–/g, "-").replace(/-{2,}/g, "-");

  const iso = (mm: number, dd: number): string | null => {
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${contextYear}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  };

  // full range mm/dd-mm/dd
  const full = /^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/.exec(body);
  if (full) {
    const start = iso(Number(full[1]), Number(full[2]));
    let end = iso(Number(full[3]), Number(full[4]));
    if (start && end && end < start) {
      // crosses into the next year
      end = `${contextYear + 1}${end.slice(4)}`;
    }
    return { start, end, raw: body, ambiguous: !start || !end };
  }

  // short range mm/dd-dd
  const short = /^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\b/.exec(body);
  if (short) {
    const mm = Number(short[1]);
    return {
      start: iso(mm, Number(short[2])),
      end: iso(mm, Number(short[3])),
      raw: body,
      ambiguous: false,
    };
  }

  const single = /^(\d{1,2})\/(\d{1,2})/.exec(body);
  if (single) {
    const d = iso(Number(single[1]), Number(single[2]));
    return { start: d, end: d, raw: body, ambiguous: d === null };
  }

  return { start: null, end: null, raw: body, ambiguous: true };
}

/* -------------------------- entry classification ------------------------ */

export function classifyEntry(raw: string): EntryType {
  const text = squash(raw);
  if (!text) return "UNKNOWN";
  const t = text.toUpperCase();

  if (/(?:^|\s)(?:STYLE\s*(?:NO|#|:)|S\s*#)/i.test(text)) return "STYLE";
  if (/\bP\.?\s*O\.?\s*[:#]/i.test(text)) return "PO";
  if (/SEWING\s*BALANCE|(?:^|\s)BALANCE\s*[-:]/i.test(text)) return "BALANCE";
  if (/LINE\s*SUPPORT|^\d{1,2}\s*LINE\b|\bLINE\s*\d+\s*&/i.test(text)) return "LINE_SUPPORT";
  if (/TOTAL\s*QTY/i.test(text)) return "TOTAL_QTY";
  if (
    /\bMANUAL\b|\bVMI\b|WASH\b|\bDARK\b|\bFAB\b|IN\s*HOUSE|HOLIDAY|MAINTENANCE|TRAINING/.test(t)
  ) {
    return "INSTRUCTION";
  }
  if (/[A-Za-z]/.test(text)) return "OTHER";
  return "UNKNOWN";
}
