import { Request, Response, NextFunction } from "express";
import { Permission, hasPermission } from "@flowforge/shared";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
