/**
 * Browser-side client for the Cloudflare-backed API.
 *
 * Every call is same-origin and carries no credentials of its own — the Worker
 * reads the signed-in identity from the request. When the deployment has no
 * database or storage configured yet, `cloudHealth()` reports that and the
 * application simply keeps working with its local session data.
 */

export type CloudHealth = {
  status: string;
  environment: string;
  version: string;
  services: { database: boolean; storage: boolean };
};

export type StoredSewingPlan = {
  id: string;
  fileName: string;
  version: number;
  status: string;
  period: string | null;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string | null;
  summary: { planningRecords?: number; linesDetected?: number } | null;
};

export type StoredPlan = {
  id: string;
  version: number;
  period: string;
  status: string;
  generated_at: string;
  sewing_plan_id: string;
  summary_json: string | null;
};

export type StoredReport = {
  id: string;
  plan_id: string;
  version: number;
  period: string;
  status: string;
  scenario_name: string | null;
  generated_at: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const reference = typeof body["reference"] === "string" ? ` Reference ID: ${body["reference"]}` : "";
    throw new Error(`${String(body["error"] ?? "Something went wrong.")}${reference}`);
  }
  return body as T;
}

export async function cloudHealth(): Promise<CloudHealth | null> {
  try {
    return await api<CloudHealth>("/api/health");
  } catch {
    return null;
  }
}

export const cloud = {
  sewingPlans: () => api<{ data: StoredSewingPlan[] }>("/api/sewing-plans"),
  uploadSewingPlan: (file: File, mode: "AUTO" | "USE_EXISTING" | "NEW_VERSION" = "AUTO") => {
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    return api<{ id: string; version: number; summary: unknown }>("/api/sewing-plans/upload", {
      method: "POST",
      body: form,
    });
  },
  uploadSmv: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return api<{ id: string; records: number }>("/api/smv/upload", { method: "POST", body: form });
  },
  plans: () => api<{ data: StoredPlan[] }>("/api/plans"),
  reports: () => api<{ data: StoredReport[] }>("/api/reports"),
  generatePlan: (payload: Record<string, unknown>, idempotencyKey: string) =>
    api<{ id: string }>("/api/plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  generateReport: (planId: string) =>
    api<{ id: string; download: string; fileName: string }>("/api/reports/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    }),
};
