import { cookies } from "next/headers";
import { readUsers } from "./db";
import type { User, Role } from "./types";

export const SESSION_COOKIE = "pg_session";

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  const { users } = readUsers();
  return users.find((u) => u.id === userId) ?? null;
}

export function requireRole(user: User | null, roles: Role[]): asserts user is User {
  if (!user) throw new ApiAuthError("Not authenticated");
  if (!roles.includes(user.role)) throw new ApiAuthError("Forbidden");
}

export class ApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export function canEdit(user: User): boolean {
  return ["RD_ENGINEER", "MT_ENGINEER"].includes(user.role);
}

export function canApprove(user: User): boolean {
  return user.role === "APPROVER";
}

export function canView(user: User): boolean {
  return true; // all authenticated users can view
}
