import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { RegisterRequestSchema, LoginRequestSchema, ROLE_PERMISSIONS } from '@flowforge/shared';
import { apiStore } from '../store.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// Register new user & primary organization
authRouter.post('/register', async (req, res) => {
  const parseResult = RegisterRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid registration details',
        details: parseResult.error.issues
      }
    });
    return;
  }

  const { email, password, firstName, lastName, organizationName } = parseResult.data;

  // Check existing user
  const existingUser = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (existingUser) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: 'USER_EXISTS',
        message: 'A user with this email address already exists.'
      }
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = `usr_${crypto.randomUUID()}`;
  const orgId = `org_${crypto.randomUUID()}`;

  apiStore.users.set(userId, {
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    firstName,
    lastName
  });

  const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  apiStore.organizations.set(orgId, {
    id: orgId,
    name: organizationName,
    slug
  });

  const membershipId = `mem_${crypto.randomUUID()}`;
  apiStore.memberships.set(membershipId, {
    id: membershipId,
    organizationId: orgId,
    userId,
    role: 'OWNER'
  });

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = `ses_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  apiStore.sessions.set(sessionId, {
    id: sessionId,
    userId,
    token,
    expiresAt
  });

  res.cookie('flowforge_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt
  });

  res.status(201).json({
    success: true,
    data: {
      user: { id: userId, email, firstName, lastName },
      organization: { id: orgId, name: organizationName, slug, role: 'OWNER' },
      token
    },
    error: null
  });
});

// Login
authRouter.post('/login', async (req, res) => {
  const parseResult = LoginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid credentials provided',
        details: parseResult.error.issues
      }
    });
    return;
  }

  const { email, password } = parseResult.data;
  const user = Array.from(apiStore.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      }
    });
    return;
  }

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = `ses_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  apiStore.sessions.set(sessionId, {
    id: sessionId,
    userId: user.id,
    token,
    expiresAt
  });

  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.userId === user.id
  );
  const org = membership ? apiStore.organizations.get(membership.organizationId) : null;

  res.cookie('flowforge_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt
  });

  res.json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      organization: org ? { id: org.id, name: org.name, slug: org.slug, role: membership?.role } : null,
      token
    },
    error: null
  });
});

// Logout
authRouter.post('/logout', requireAuth, (req, res) => {
  const token =
    req.cookies?.flowforge_session ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (token) {
    const session = Array.from(apiStore.sessions.values()).find((s) => s.token === token);
    if (session) {
      apiStore.sessions.delete(session.id);
    }
  }

  res.clearCookie('flowforge_session');
  res.json({
    success: true,
    data: { message: 'Logged out successfully.' },
    error: null
  });
});

// Current User & Active Organization
authRouter.get('/me', requireAuth, (req, res) => {
  const user = req.user!;
  const org = req.organizationId ? apiStore.organizations.get(req.organizationId) : null;
  const role = req.role;
  const permissions = role ? ROLE_PERMISSIONS[role] : [];

  res.json({
    success: true,
    data: {
      user,
      organization: org ? { id: org.id, name: org.name, slug: org.slug, role } : null,
      permissions
    },
    error: null
  });
});
