/**
 * Minimal, format-preserving XLSX patcher.
 *
 * Reads an .xlsx (zip of XML), rewrites individual cell values/formulas in
 * place and writes the zip back out. Unlike full read/write libraries this
 * keeps everything we do not touch byte-identical: charts, drawings, styles,
 * conditional formatting, data validation, array formulas, print setup.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

export type CellInput =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "formula"; value: string }
  | { kind: "date"; value: Date }
  | { kind: "blank" };

const XLSX_EPOCH = Date.UTC(1899, 11, 30);

export function toExcelSerial(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return (utc - XLSX_EPOCH) / 86400000;
}

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function splitRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell reference: ${ref}`);
  return { col: m[1]!, row: Number(m[2]) };
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

class SheetDoc {
  readonly doc: Document;
  private readonly sheetData: Element;
  private readonly rows = new Map<number, Element>();
  /** Fallback style index per column, learned from existing cells. */
  private readonly colStyle = new Map<string, string>();

  constructor(xml: string) {
    this.doc = new DOMParser().parseFromString(xml, "application/xml");
    const sd = this.doc.getElementsByTagName("sheetData")[0];
    if (!sd) throw new Error("sheetData missing");
    this.sheetData = sd;
    const rowEls = sd.getElementsByTagName("row");
    for (let i = 0; i < rowEls.length; i++) {
      const row = rowEls[i]!;
      this.rows.set(Number(row.getAttribute("r")), row);
    }
  }

  private cellStyleFor(col: string, row: number): string | null {
    const key = `${col}`;
    if (this.colStyle.has(key)) return this.colStyle.get(key)!;
    // look for the same column in nearby rows to copy its style index
    for (const candidate of [row - 1, row + 1, row - 2, row + 2, row - 3, row + 3]) {
      const r = this.rows.get(candidate);
      if (!r) continue;
      const c = this.findCell(r, `${col}${candidate}`);
      const s = c?.getAttribute("s");
      if (s) {
        this.colStyle.set(key, s);
        return s;
      }
    }
    return null;
  }

  private findCell(row: Element, ref: string): Element | null {
    const cells = row.getElementsByTagName("c");
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]!.getAttribute("r") === ref) return cells[i]!;
    }
    return null;
  }

  private ensureRow(rowNum: number): Element {
    const existing = this.rows.get(rowNum);
    if (existing) return existing;
    const row = this.doc.createElementNS(NS, "row");
    row.setAttribute("r", String(rowNum));
    // insert keeping ascending order
    let inserted = false;
    const rowEls = this.sheetData.getElementsByTagName("row");
    for (let i = 0; i < rowEls.length; i++) {
      if (Number(rowEls[i]!.getAttribute("r")) > rowNum) {
        this.sheetData.insertBefore(row, rowEls[i]!);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.sheetData.appendChild(row);
    this.rows.set(rowNum, row);
    return row;
  }

  private ensureCell(ref: string): Element {
    const { col, row: rowNum } = splitRef(ref);
    const row = this.ensureRow(rowNum);
    const found = this.findCell(row, ref);
    if (found) return found;
    const cell = this.doc.createElementNS(NS, "c");
    cell.setAttribute("r", ref);
    const style = this.cellStyleFor(col, rowNum);
    if (style) cell.setAttribute("s", style);
    const target = colToIndex(col);
    let inserted = false;
    const cells = row.getElementsByTagName("c");
    for (let i = 0; i < cells.length; i++) {
      const other = splitRef(cells[i]!.getAttribute("r")!);
      if (colToIndex(other.col) > target) {
        row.insertBefore(cell, cells[i]!);
        inserted = true;
        break;
      }
    }
    if (!inserted) row.appendChild(cell);
    return cell;
  }

  set(ref: string, input: CellInput): void {
    const cell = this.ensureCell(ref);
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.removeAttribute("t");
    cell.removeAttribute("cm");
    cell.removeAttribute("vm");

    if (input.kind === "blank") return;

    if (input.kind === "formula") {
      const f = this.doc.createElementNS(NS, "f");
      f.textContent = input.value.replace(/^=/, "");
      cell.appendChild(f);
      return;
    }

    if (input.kind === "string") {
      cell.setAttribute("t", "inlineStr");
      const is = this.doc.createElementNS(NS, "is");
      const t = this.doc.createElementNS(NS, "t");
      t.setAttribute("xml:space", "preserve");
      t.textContent = input.value;
      is.appendChild(t);
      cell.appendChild(is);
      return;
    }

    const v = this.doc.createElementNS(NS, "v");
    v.textContent = String(
      input.kind === "date" ? toExcelSerial(input.value) : input.value,
    );
    cell.appendChild(v);
  }

  /** Rewrite the formula of every cell that already has one, via a mapper. */
  mapFormulas(fn: (formula: string, ref: string) => string | null): number {
    let changed = 0;
    const fEls = this.doc.getElementsByTagName("f");
    for (let i = 0; i < fEls.length; i++) {
      const f = fEls[i]!;
      const ref = (f.parentNode as Element | null)?.getAttribute("r") ?? "";
      const current = f.textContent ?? "";
      const next = fn(current, ref);
      if (next != null && next !== current) {
        f.textContent = next;
        changed++;
      }
    }
    return changed;
  }

  toXml(): string {
    return new XMLSerializer().serializeToString(this.doc);
  }
}

export class XlsxPatcher {
  private readonly files: Record<string, Uint8Array>;
  private readonly sheetPaths = new Map<string, string>();
  private readonly open = new Map<string, SheetDoc>();

  private constructor(files: Record<string, Uint8Array>) {
    this.files = files;
    this.mapSheets();
  }

  static fromBuffer(buffer: ArrayBuffer): XlsxPatcher {
    return new XlsxPatcher(unzipSync(new Uint8Array(buffer)));
  }

  private text(path: string): string {
    const f = this.files[path];
    if (!f) throw new Error(`Missing ${path} in workbook`);
    return strFromU8(f);
  }

  private mapSheets(): void {
    const wb = new DOMParser().parseFromString(
      this.text("xl/workbook.xml"),
      "application/xml",
    );
    const rels = new DOMParser().parseFromString(
      this.text("xl/_rels/workbook.xml.rels"),
      "application/xml",
    );
    const relTarget = new Map<string, string>();
    const relEls = rels.getElementsByTagName("Relationship");
    for (let i = 0; i < relEls.length; i++) {
      const r = relEls[i]!;
      relTarget.set(r.getAttribute("Id")!, r.getAttribute("Target")!);
    }
    const sheets = wb.getElementsByTagName("sheet");
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i]!;
      const rid =
        s.getAttribute("r:id") ?? s.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id",
        );
      const target = rid ? relTarget.get(rid) : undefined;
      if (!target) continue;
      const path = target.startsWith("/")
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, "")}`;
      this.sheetPaths.set(s.getAttribute("name")!, path);
    }
  }

  get sheetNames(): string[] {
    return [...this.sheetPaths.keys()];
  }

  sheet(name: string): SheetDoc {
    const cached = this.open.get(name);
    if (cached) return cached;
    const path = this.sheetPaths.get(name);
    if (!path) throw new Error(`Sheet "${name}" not found in template`);
    const doc = new SheetDoc(this.text(path));
    this.open.set(name, doc);
    return doc;
  }

  /** Force Excel / LibreOffice / Sheets to recompute everything on open. */
  private forceRecalc(): void {
    const path = "xl/workbook.xml";
    let xml = this.text(path);
    if (/<calcPr[^>]*\/>/.test(xml)) {
      xml = xml.replace(/<calcPr([^>]*)\/>/, (_all, attrs: string) => {
        const cleaned = attrs.replace(/\s*fullCalcOnLoad="[^"]*"/, "");
        return `<calcPr${cleaned} fullCalcOnLoad="1"/>`;
      });
    } else {
      xml = xml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    }
    this.files[path] = strToU8(xml);
    delete this.files["xl/calcChain.xml"];
  }

  toBlob(): Blob {
    for (const [name, doc] of this.open) {
      this.files[this.sheetPaths.get(name)!] = strToU8(doc.toXml());
    }
    this.forceRecalc();
    const zipped = zipSync(this.files, { level: 6 });
    const copy = new Uint8Array(zipped);
    return new Blob([copy.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
}

export type { SheetDoc };
