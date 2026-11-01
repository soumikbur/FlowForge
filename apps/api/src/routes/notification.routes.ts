import { Router, Request, Response } from "express";
import {
  NotificationCategoryEnum,
  NotificationQuerySchema,
  UpdateNotificationReadSchema,
  UpdateNotificationPreferencesSchema,
  NotificationCategory,
} from "@flowforge/shared";
import { apiStore } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

/**
 * GET /api/v1/notifications
 * List notifications for the authenticated user in the current organization.
 */
notificationRouter.get(
  "/",
  requirePermission("notifications:read"),
  (req: Request, res: Response) => {
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    const queryParse = NotificationQuerySchema.safeParse(req.query);
    const { page, pageSize, isRead, category } = queryParse.success
      ? queryParse.data
      : { page: 1, pageSize: 20, isRead: undefined, category: undefined };

    let notifs = Array.from(apiStore.notifications.values()).filter(
      (n) => n.userId === userId && n.organizationId === orgId,
    );

    if (isRead !== undefined) {
      notifs = notifs.filter((n) => n.isRead === isRead);
    }
    if (category) {
      notifs = notifs.filter((n) => n.category === category);
    }

    // Sort newest first
    notifs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = notifs.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = notifs.slice(startIndex, startIndex + pageSize);

    res.json({
      success: true,
      data: paginated,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
      error: null,
    });
  },
);

/**
 * GET /api/v1/notifications/unread-count
 * Returns the unread notification count for the authenticated user.
 */
notificationRouter.get(
  "/unread-count",
  requirePermission("notifications:read"),
  (req: Request, res: Response) => {
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    const unreadCount = Array.from(apiStore.notifications.values()).filter(
      (n) => n.userId === userId && n.organizationId === orgId && !n.isRead,
    ).length;

    res.json({
      success: true,
      data: { unreadCount },
      error: null,
    });
  },
);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read or unread.
 */
notificationRouter.patch(
  "/:id/read",
  requirePermission("notifications:write"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    const notif = apiStore.notifications.get(id);
    // Strict tenant and user ownership check
    if (!notif || notif.organizationId !== orgId || notif.userId !== userId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Notification not found." },
      });
      return;
    }

    const parseResult = UpdateNotificationReadSchema.safeParse(req.body);
    const isRead = parseResult.success ? parseResult.data.isRead : true;

    notif.isRead = isRead;
    notif.readAt = isRead ? new Date() : null;
    apiStore.notifications.set(id, notif);

    res.json({
      success: true,
      data: notif,
      error: null,
    });
  },
);

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for current user in current organization.
 */
notificationRouter.post(
  "/read-all",
  requirePermission("notifications:write"),
  (req: Request, res: Response) => {
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    let count = 0;
    for (const notif of apiStore.notifications.values()) {
      if (
        notif.userId === userId &&
        notif.organizationId === orgId &&
        !notif.isRead
      ) {
        notif.isRead = true;
        notif.readAt = new Date();
        apiStore.notifications.set(notif.id, notif);
        count++;
      }
    }

    res.json({
      success: true,
      data: { markedReadCount: count },
      error: null,
    });
  },
);

/**
 * DELETE /api/v1/notifications/:id
 * Delete a notification.
 */
notificationRouter.delete(
  "/:id",
  requirePermission("notifications:write"),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    const notif = apiStore.notifications.get(id);
    if (!notif || notif.organizationId !== orgId || notif.userId !== userId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Notification not found." },
      });
      return;
    }

    apiStore.notifications.delete(id);
    res.json({
      success: true,
      data: { message: "Notification deleted successfully." },
      error: null,
    });
  },
);

/**
 * GET /api/v1/notifications/preferences
 * Retrieve current user notification preferences across all categories.
 */
notificationRouter.get(
  "/preferences",
  requirePermission("notifications:read"),
  (req: Request, res: Response) => {
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    const categories = NotificationCategoryEnum.options;
    const preferences = categories.map((cat) => {
      const key = `${userId}_${cat}`;
      const pref = apiStore.notificationPreferences.get(key);
      return {
        category: cat,
        inApp: pref ? pref.inApp : true,
        email: pref ? pref.email : cat === "APPROVAL",
      };
    });

    res.json({
      success: true,
      data: preferences,
      error: null,
    });
  },
);

/**
 * PATCH /api/v1/notifications/preferences
 * Update user notification preferences.
 */
notificationRouter.patch(
  "/preferences",
  requirePermission("notifications:write"),
  (req: Request, res: Response) => {
    const userId = req.user!.id;
    const orgId = req.organizationId!;

    const parseResult = UpdateNotificationPreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid notification preferences payload.",
          details: parseResult.error.format(),
        },
      });
      return;
    }

    const updatedPrefs = [];
    const now = new Date();

    for (const item of parseResult.data.preferences) {
      const key = `${userId}_${item.category}`;
      const record = {
        id: `pref_${userId}_${item.category}`,
        organizationId: orgId,
        userId,
        category: item.category as NotificationCategory,
        inApp: item.inApp,
        email: item.email,
        createdAt: now,
        updatedAt: now,
      };
      apiStore.notificationPreferences.set(key, record);
      updatedPrefs.push({
        category: record.category,
        inApp: record.inApp,
        email: record.email,
      });
    }

    apiStore.recordAudit({
      organizationId: orgId,
      userId,
      action: "notification_preferences:update",
      resourceType: "user_preference",
      resourceId: userId,
    });

    res.json({
      success: true,
      data: updatedPrefs,
      error: null,
    });
  },
);

/**
 * GET /api/v1/notifications/metrics
 * Returns operational delivery and notification metrics.
 */
notificationRouter.get(
  "/metrics",
  requirePermission("notifications:read"),
  (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    const pendingOutboxCount = Array.from(
      apiStore.outboxEvents.values(),
    ).filter(
      (o) =>
        o.organizationId === orgId &&
        (o.status === "PENDING" || o.status === "PROCESSING"),
    ).length;

    const deliveries = Array.from(apiStore.webhookDeliveries.values()).filter(
      (d) => d.organizationId === orgId,
    );

    const deliveryStats = {
      total: deliveries.length,
      succeeded: deliveries.filter((d) => d.status === "SUCCEEDED").length,
      failedPermanently: deliveries.filter(
        (d) => d.status === "FAILED_PERMANENTLY",
      ).length,
      retryScheduled: deliveries.filter((d) => d.status === "RETRY_SCHEDULED")
        .length,
      deadLettered: deliveries.filter((d) => d.status === "DEAD_LETTERED")
        .length,
      pending: deliveries.filter(
        (d) => d.status === "PENDING" || d.status === "PROCESSING",
      ).length,
    };

    res.json({
      success: true,
      data: {
        pendingOutboxCount,
        deliveries: deliveryStats,
      },
      error: null,
    });
  },
);
