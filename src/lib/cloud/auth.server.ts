/**
 * Authentication for the production deployment.
 *
 * Cloudflare Access sits in front of the Worker and injects a verified
 * identity header on every request. We read that identity, then look the user
 * up in D1 to obtain their role and factory. Users are never trusted to send
 * their own role.
 */
import { cloudEnv, requireDb } from "./bindings.server";
import type { Role } from "./roles";
import { can, type Permission } from "./roles";

export type AuthUser = {
  id: string;
  email: string;
  userName: string;
  role: Role;
  factoryId: string;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Identity as asserted by Cloudflare Access (already verified at the edge). */
function accessIdentity(request: Request): { email: string; name: string } | null {
  const email = request.headers.get("cf-access-authenticated-user-email");
  if (email) return { email, name: email.split("@")[0] ?? email };

  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (jwt) {
    const payload = decodeJwtPayload(jwt);
    const claimed = typeof payload?.["email"] === "string" ? (payload["email"] as string) : null;
    if (claimed) return { email: claimed, name: claimed.split("@")[0] ?? claimed };
  }
  return null;
}

export async function currentUser(request: Request): Promise<AuthUser> {
  const env = await cloudEnv();
  const identity = accessIdentity(request);

  if (!identity) {
    // Development only: no Access in front, no real users table yet.
    if ((env.ENVIRONMENT ?? "development") === "development") {
      return {
        id: "dev-user",
        email: "dev@armanagroup.com",
        userName: "Development user",
        role: "ADMIN",
        factoryId: "fac_armana_apparels",
      };
    }
    throw new AuthError("Not signed in.");
  }

  const db = await requireDb();
  const row = await db
    .prepare(
      "SELECT id, email, user_name, role, factory_id, active FROM users WHERE lower(email) = lower(?1)",
    )
    .bind(identity.email)
    .first<{
      id: string;
      email: string;
      user_name: string;
      role: Role;
      factory_id: string | null;
      active: number;
    }>();

  if (!row || !row.active) throw new AuthError("This account has no access to the planning system.", 403);
  if (!row.factory_id) throw new AuthError("This account is not assigned to a factory.", 403);

  return {
    id: row.id,
    email: row.email,
    userName: row.user_name,
    role: row.role,
    factoryId: row.factory_id,
  };
}

export function requirePermission(user: AuthUser, permission: Permission): void {
  if (!can(user.role, permission)) {
    throw new AuthError("You do not have permission to perform this action.", 403);
  }
}

/** Factory isolation — enforced here, never in the browser. */
export function requireFactory(user: AuthUser, factoryId: string | null | undefined): string {
  const target = factoryId ?? user.factoryId;
  if (target !== user.factoryId && user.role !== "ADMIN") {
    throw new AuthError("This record belongs to another factory.", 403);
  }
  return target;
}
