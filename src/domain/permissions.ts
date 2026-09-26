/**
 * Role → permission map. Authorization checks ask for a permission, never a role,
 * so adding SALES / DESIGNER / SUPER_ADMIN later is a change to this table only.
 */
export type Role = "CUSTOMER" | "ADMIN" | "PRODUCTION";
export type StaffRole = Exclude<Role, "CUSTOMER">;

export type Permission =
  | "admin:access"
  | "orders:read"
  | "orders:update_status"
  | "orders:cancel"
  | "orders:record_payment"
  | "artwork:download"
  | "production:generate"
  | "catalogue:write"
  | "settings:write"
  | "audit:read";

const GRANTS: Record<Role, readonly Permission[]> = {
  CUSTOMER: [],
  ADMIN: [
    "admin:access",
    "orders:read",
    "orders:update_status",
    "orders:cancel",
    "orders:record_payment",
    "artwork:download",
    "production:generate",
    "catalogue:write",
    "settings:write",
    "audit:read",
  ],
  PRODUCTION: ["admin:access", "orders:read", "orders:update_status", "artwork:download", "production:generate"],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => GRANTS[r].includes(permission));
}

export function isStaff(roles: readonly Role[]): boolean {
  return can(roles, "admin:access");
}
