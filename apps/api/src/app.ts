import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from './middleware/rate-limit.js';
import { authRouter } from './routes/auth.routes.js';
import { workflowRouter } from './routes/workflow.routes.js';
import { executionRouter } from './routes/execution.routes.js';
import { approvalRouter } from './routes/approval.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit(60000, 300));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mount API v1 Routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/workflows', workflowRouter);
app.use('/api/v1/executions', executionRouter);
app.use('/api/v1/approvals', approvalRouter);
app.use('/api/v1/webhooks', webhookRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// 404 Fallback
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    data: null,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`
    }
  });
});

// Centralized error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected server error occurred.',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }
  });
});
