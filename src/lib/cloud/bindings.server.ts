/**
 * Access to the Cloudflare Worker bindings (D1 + R2) without pulling
 * `@cloudflare/workers-types` into the build. The specifier is resolved at
 * runtime so the module is a harmless no-op during local development, where
 * no bindings exist and the application keeps using browser storage.
 */

export type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
};

export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<D1Result>;
};

export type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<D1Result[]>;
  exec: (query: string) => Promise<unknown>;
};

export type R2Object = {
  key: string;
  size: number;
  httpEtag?: string;
  body: ReadableStream;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type R2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ) => Promise<{ key: string; size: number } | null>;
  get: (key: string) => Promise<R2Object | null>;
  head: (key: string) => Promise<{ key: string; size: number } | null>;
  delete: (key: string) => Promise<void>;
};

export type CloudEnv = {
  DB?: D1Database;
  FILES?: R2Bucket;
  ENVIRONMENT?: string;
  APP_BASE_URL?: string;
  ALLOWED_ORIGINS?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
};

let cachedEnv: CloudEnv | null = null;

export async function cloudEnv(): Promise<CloudEnv> {
  if (cachedEnv) return cachedEnv;
  let resolved: CloudEnv = {};
  try {
    const specifier = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ specifier)) as { env?: CloudEnv };
    resolved = mod.env ?? {};
  } catch {
    resolved = {};
  }
  // process.env supplies the plain vars when running outside the Worker.
  cachedEnv = {
    ...resolved,
    ENVIRONMENT: resolved.ENVIRONMENT ?? process.env["ENVIRONMENT"] ?? "development",
    APP_BASE_URL: resolved.APP_BASE_URL ?? process.env["APP_BASE_URL"] ?? "http://localhost:8080",
    ALLOWED_ORIGINS: resolved.ALLOWED_ORIGINS ?? process.env["ALLOWED_ORIGINS"] ?? "",
  };
  return cachedEnv;
}

export async function requireDb(): Promise<D1Database> {
  const env = await cloudEnv();
  if (!env.DB) throw new CloudUnavailableError("database");
  return env.DB;
}

export async function requireBucket(): Promise<R2Bucket> {
  const env = await cloudEnv();
  if (!env.FILES) throw new CloudUnavailableError("file storage");
  return env.FILES;
}

export async function cloudConfigured(): Promise<{ database: boolean; storage: boolean }> {
  const env = await cloudEnv();
  return { database: Boolean(env.DB), storage: Boolean(env.FILES) };
}

export class CloudUnavailableError extends Error {
  constructor(part: string) {
    super(`Cloud ${part} is not configured for this environment.`);
    this.name = "CloudUnavailableError";
  }
}
