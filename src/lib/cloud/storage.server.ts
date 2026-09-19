/**
 * R2 object storage. Files live in R2, metadata lives in D1 — never the other
 * way round, and uploaded workbooks are never written into the repository.
 */
import { requireBucket } from "./bindings.server";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function sewingPlanKey(planId: string, year: string, month: string): string {
  return `sewing-plans/${year}/${month}/${planId}.xlsx`;
}

export function smvKey(versionId: string, year: string): string {
  return `smv/${year}/${versionId}.xlsx`;
}

export function reportKey(year: string, month: string, fileName: string): string {
  return `reports/${year}/${month}/${fileName}`;
}

export async function putObject(
  key: string,
  data: ArrayBuffer,
  contentType = XLSX_TYPE,
  metadata?: Record<string, string>,
): Promise<{ key: string; size: number }> {
  const bucket = await requireBucket();
  await bucket.put(key, data, { httpMetadata: { contentType }, customMetadata: metadata });
  return { key, size: data.byteLength };
}

export async function getObject(key: string): Promise<ArrayBuffer | null> {
  const bucket = await requireBucket();
  const object = await bucket.get(key);
  if (!object) return null;
  return object.arrayBuffer();
}

export async function objectExists(key: string): Promise<boolean> {
  const bucket = await requireBucket();
  return Boolean(await bucket.head(key));
}
