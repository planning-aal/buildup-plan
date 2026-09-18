import type { SmvMasterRecord } from "@/lib/import/types";
import { parseSmvFile } from "@/lib/plan/smv";

let seq = 0;
const nextId = () => `smv_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function smvRecord(
  styleNo: string,
  smv: number | null,
  source: string,
  buyer: string | null = null,
  effectiveDate: string | null = null,
): SmvMasterRecord {
  return {
    id: nextId(),
    styleNo: styleNo.trim(),
    buyer,
    smv,
    effectiveDate,
    status: smv === null ? "SMV_MISSING" : smv > 0 ? "SMV_FOUND" : "SMV_INVALID",
    source,
    updatedAt: new Date().toISOString(),
  };
}

/** Reads a bulk SMV workbook/CSV into master records. */
export function readSmvUpload(
  buffer: ArrayBuffer,
  fileName: string,
): { records: SmvMasterRecord[]; error?: string } {
  const { entries, error } = parseSmvFile(buffer);
  if (error) return { records: [], error };
  return { records: entries.map((e) => smvRecord(e.style, e.smv, fileName)) };
}

/** CSV export of the master, ready for re-upload. */
export function smvToCsv(records: SmvMasterRecord[]): string {
  const head = "Style No,Buyer,SMV,Effective Date,Status,Source,Last Updated";
  const rows = records.map((r) =>
    [
      r.styleNo,
      r.buyer ?? "",
      r.smv ?? "",
      r.effectiveDate ?? "",
      r.status,
      r.source,
      r.updatedAt,
    ]
      .map((v) => (String(v).includes(",") ? `"${v}"` : String(v)))
      .join(","),
  );
  return [head, ...rows].join("\n");
}

export function downloadText(fileName: string, text: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
