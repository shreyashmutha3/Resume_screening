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

// Parse AUTH_TOKENS dynamically on module load
let validTokens: Record<string, RequestContext> = {};

if (!process.env.AUTH_TOKENS) {
  console.error("\n❌ ERROR: AUTH_TOKENS environment variable is missing.");
  console.error("Please provide a JSON mapping of API keys to roles in the environment.\n");
  process.exit(1);
}

try {
  validTokens = JSON.parse(process.env.AUTH_TOKENS);
} catch (e) {
  console.error("\n❌ ERROR: Failed to parse AUTH_TOKENS environment variable. Must be valid JSON mapping tokens to RequestContexts.\n");
  process.exit(1);
}

if (process.env.DEV_MODE === "true") {
  console.warn("⚠️  WARNING: DEV_MODE is enabled. The server will trust header-based authentication fallbacks. DO NOT USE IN PRODUCTION.");
}

export function parseRequestContext(headers: IncomingHttpHeaders): RequestContext {
  const authHeader = normalizeHeaderValue(headers["authorization"]) || normalizeHeaderValue(headers["x-api-key"]);
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token && validTokens[token]) {
    // Return the fixed context mapped to this token. Never trust client-supplied headers.
    return { ...validTokens[token] };
  }

  const devMode = process.env.DEV_MODE === "true";
  if (devMode) {
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

  throw new AuthorizationError("Valid Authentication Token Required");
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