import { Request, Response, NextFunction } from "express";
import { apiStore } from "../store.js";
import { Role } from "@flowforge/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
      };
      organizationId?: string;
      role?: Role;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token =
    req.cookies?.flowforge_session ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to access this resource.",
      },
    });
    return;
  }

  // Look up session
  let session = Array.from(apiStore.sessions.values()).find(
    (s) => s.token === token,
  );

  if (!session || new Date() > new Date(session.expiresAt)) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "INVALID_SESSION",
        message: "Session has expired or is invalid.",
      },
    });
    return;
  }

  const user = apiStore.users.get(session.userId);
  if (!user) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: "USER_NOT_FOUND",
        message: "Associated user could not be found.",
      },
    });
    return;
  }

  // Find user membership
  const userMemberships = Array.from(apiStore.memberships.values()).filter(
    (m) => m.userId === user.id,
  );

  const requestedOrgId = (req.headers["x-organization-id"] as string) || undefined;
  const membership = requestedOrgId
    ? userMemberships.find((m) => m.organizationId === requestedOrgId)
    : userMemberships[0];

  req.user = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  if (membership) {
    req.organizationId = membership.organizationId;
    req.role = membership.role;
  }

  next();
}
