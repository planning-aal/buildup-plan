/**
 * Shared API plumbing: request IDs, JSON responses, CORS, error shaping,
 * rate limiting and the audit log helper.
 */
import { AuthError, currentUser, type AuthUser } from "./auth.server";
import { CloudUnavailableError, cloudEnv, requireDb } from "./bindings.server";
import type { Permission } from "./roles";

export function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

async function corsHeaders(request: Request): Promise<Record<string, string>> {
  const env = await cloudEnv();
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "content-type,idempotency-key";
  }
  return headers;
}

export async function json(
  request: Request,
  body: unknown,
  init: { status?: number; requestId?: string } = {},
): Promise<Response> {
  const headers = await corsHeaders(request);
  headers["content-type"] = "application/json; charset=utf-8";
  headers["cache-control"] = "no-store";
  if (init.requestId) headers["x-request-id"] = init.requestId;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export type ApiContext = { user: AuthUser; requestId: string; factoryId: string };

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Wraps a handler: assigns a request ID, authenticates, checks the permission,
 * and converts any failure into a safe JSON error that never leaks internals.
 */
export function handler(
  permission: Permission | null,
  fn: (args: {
    request: Request;
    ctx: ApiContext;
    params: Record<string, string>;
  }) => Promise<Response>,
) {
  return async ({ request, params }: { request: Request; params?: Record<string, string> }) => {
    const requestId = newRequestId();
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: await corsHeaders(request) });
      }
      const user = await currentUser(request);
      if (permission) {
        const { can } = await import("./roles");
        if (!can(user.role, permission))
          throw new AuthError("You do not have permission to do this.", 403);
      }
      return await fn({
        request,
        ctx: { user, requestId, factoryId: user.factoryId },
        params: params ?? {},
      });
    } catch (error) {
      const status =
        error instanceof AuthError
          ? error.status
          : error instanceof ApiError
            ? error.status
            : error instanceof CloudUnavailableError
              ? 503
              : 500;
      const message =
        error instanceof AuthError ||
        error instanceof ApiError ||
        error instanceof CloudUnavailableError
          ? error.message
          : "Something went wrong.";
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          requestId,
          endpoint: new URL(request.url).pathname,
          method: request.method,
          errorType: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return json(
        request,
        { error: message, requestId, reference: requestId },
        { status, requestId },
      );
    }
  };
}

/**
 * Read-only listings should not fail when no database is configured yet —
 * the application simply has no stored history to show.
 */
export async function listOrEmpty<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof CloudUnavailableError) return fallback;
    throw error;
  }
}

/** Simple fixed-window limiter stored in D1; only used on expensive endpoints. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  let db;
  try {
    db = await requireDb();
  } catch {
    return; // no database in this environment — nothing to protect
  }
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare("SELECT window_started_at, hits FROM rate_limits WHERE bucket_key = ?1")
    .bind(key)
    .first<{ window_started_at: number; hits: number }>();

  if (!row || now - row.window_started_at >= windowSeconds) {
    await db
      .prepare(
        "INSERT INTO rate_limits (bucket_key, window_started_at, hits) VALUES (?1, ?2, 1) " +
          "ON CONFLICT(bucket_key) DO UPDATE SET window_started_at = ?2, hits = 1",
      )
      .bind(key, now)
      .run();
    return;
  }
  if (row.hits >= limit) {
    throw new ApiError(
      "Too many requests — please wait a moment and try again.",
      429,
      "RATE_LIMITED",
    );
  }
  await db.prepare("UPDATE rate_limits SET hits = hits + 1 WHERE bucket_key = ?1").bind(key).run();
}

export async function audit(
  ctx: ApiContext,
  action: string,
  entityType: string,
  entityId: string,
  values?: { old?: unknown; new?: unknown },
): Promise<void> {
  try {
    const db = await requireDb();
    await db
      .prepare(
        "INSERT INTO audit_logs (id, user_id, user_email, factory_id, action, entity_type, entity_id, old_value, new_value, request_id) " +
          "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
      )
      .bind(
        newId("aud"),
        ctx.user.id,
        ctx.user.email,
        ctx.factoryId,
        action,
        entityType,
        entityId,
        values?.old ? JSON.stringify(values.old) : null,
        values?.new ? JSON.stringify(values.new) : null,
        ctx.requestId,
      )
      .run();
  } catch (error) {
    console.error("audit log failed", { requestId: ctx.requestId, error: String(error) });
  }
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function pagination(url: URL, defaultLimit = 100, maxLimit = 1000) {
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? defaultLimit) || defaultLimit, 1),
    maxLimit,
  );
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  return { limit, offset };
}
