import { Request, Response, NextFunction } from "express";
import {
  Permission,
  hasPermission,
  hasScopePermission,
} from "@flowforge/shared";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If request is authenticated via an API Key or OAuth client, verify explicit scopes
    if (req.isApiKey || req.isOAuthClient) {
      if (
        !req.apiKeyScopes ||
        !hasScopePermission(req.apiKeyScopes, permission)
      ) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: "INSUFFICIENT_SCOPE",
            message: `API client lacks required scope for '${permission}'.`,
          },
        });
        return;
      }
      return next();
    }

    if (!req.role) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "No organization membership role found.",
        },
      });
      return;
    }

    if (!hasPermission(req.role, permission)) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: `Permission denied: Requires permission '${permission}'.`,
        },
      });
      return;
    }

    next();
  };
}
