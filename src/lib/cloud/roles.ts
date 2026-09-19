/** Roles and permissions. Client-safe: used for UI gating as well as the API. */

export type Role = "ADMIN" | "PLANNER" | "IE" | "PRODUCTION" | "MANAGEMENT" | "VIEWER";

export type Permission =
  | "plan.upload"
  | "plan.read"
  | "plan.generate"
  | "smv.read"
  | "smv.write"
  | "calendar.read"
  | "calendar.write"
  | "lines.read"
  | "lines.write"
  | "efficiency.write"
  | "scenario.read"
  | "scenario.write"
  | "report.read"
  | "report.generate"
  | "report.export"
  | "audit.read"
  | "admin";

const READ_ONLY: Permission[] = [
  "plan.read",
  "smv.read",
  "calendar.read",
  "lines.read",
  "scenario.read",
  "report.read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    ...READ_ONLY,
    "plan.upload",
    "plan.generate",
    "smv.write",
    "calendar.write",
    "lines.write",
    "efficiency.write",
    "scenario.write",
    "report.generate",
    "report.export",
    "audit.read",
    "admin",
  ],
  PLANNER: [
    ...READ_ONLY,
    "plan.upload",
    "plan.generate",
    "calendar.write",
    "lines.write",
    "efficiency.write",
    "scenario.write",
    "report.generate",
    "report.export",
  ],
  IE: [...READ_ONLY, "smv.write", "efficiency.write", "report.generate", "report.export"],
  PRODUCTION: [...READ_ONLY],
  MANAGEMENT: [...READ_ONLY, "report.generate", "report.export"],
  VIEWER: [...READ_ONLY],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PLANNER: "Planner",
  IE: "Industrial engineering",
  PRODUCTION: "Production",
  MANAGEMENT: "Management",
  VIEWER: "Viewer",
};
