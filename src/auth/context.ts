import type { IncomingHttpHeaders } from "node:http";
import type { UserRole } from "../domain";

export interface RequestContext {
  orgId: string;
  userId: string;
  userRole: UserRole;
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const allowedRoles: UserRole[] = ["RECRUITER", "CANDIDATE", "ADMIN"];
const demoContext: RequestContext = {
  orgId: "demo-org",
  userId: "demo-user",
  userRole: "ADMIN",
};

export function parseRequestContext(headers: IncomingHttpHeaders): RequestContext {
  const orgId = normalizeHeaderValue(headers["x-org-id"]) || demoContext.orgId;
  const userId = normalizeHeaderValue(headers["x-user-id"]) || demoContext.userId;
  const userRoleValue = normalizeHeaderValue(headers["x-user-role"]) || demoContext.userRole;

  if (!isUserRole(userRoleValue)) {
    throw new AuthorizationError("Invalid x-user-role header");
  }

  return {
    orgId,
    userId,
    userRole: userRoleValue,
  };
}

export function assertRole(
  context: RequestContext,
  allowed: UserRole[],
  actionDescription: string,
): void {
  if (!allowed.includes(context.userRole)) {
    throw new AuthorizationError(`${actionDescription} requires one of: ${allowed.join(", ")}`);
  }
}

export function canManageJobs(context: RequestContext): boolean {
  return context.userRole === "RECRUITER" || context.userRole === "ADMIN";
}

export function canScoreCandidates(context: RequestContext): boolean {
  return context.userRole === "RECRUITER" || context.userRole === "ADMIN";
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function isUserRole(value: string): value is UserRole {
  return allowedRoles.includes(value as UserRole);
}