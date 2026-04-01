import express from 'express';
import { createServer as createViteServer } from 'vite';
import db from './db.ts';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

type UserRole = 'student' | 'host' | 'admin' | 'sponsor';

interface AuthPayload {
  userId: string;
  role: UserRole;
}

interface TicketTokenPayload {
  typ: 'event_ticket';
  v: 1;
  ticketId: string;
  eventId: string;
  userId: string;
  bookingRef: string;
}

interface TicketVerifyResult {
  success: boolean;
  alreadyCheckedIn?: boolean;
  ticket?: any;
  error?: string;
  statusCode?: number;
}

type VerificationStatus = 'PENDING_VERIFICATION' | 'VERIFIED_ATTENDANCE';

type AuthedRequest = express.Request & { auth?: AuthPayload };

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const TICKET_QR_TYPE = 'eventhub_ticket';
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. Using an insecure development fallback secret.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeExt = (path.extname(file.originalname || '').toLowerCase() || '.bin').replace(/[^.a-z0-9]/g, '');
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const allowedUploadMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedUploadMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, and WEBP images are allowed'));
    }
    cb(null, true);
  },
});

const safeJson = (value: any, fallback: any = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parseNum = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const SPONSORSHIP_REQUEST_EXPIRY_DAYS = 14;

const nextSponsorshipRequestExpiryIso = () => {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + SPONSORSHIP_REQUEST_EXPIRY_DAYS);
  return expires.toISOString();
};

const isSqliteConstraintError = (error: any) =>
  String(error?.code || '').toUpperCase() === 'SQLITE_CONSTRAINT' ||
  /SQLITE_CONSTRAINT|UNIQUE constraint failed/i.test(String(error?.message || ''));

const generateReferralCode = () => `EH${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const generateTicketId = () => `TKT-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;

const buildTicketExpiryIso = (eventDate: string | null | undefined) => {
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + 30);

  const parsed = eventDate ? Date.parse(eventDate) : NaN;
  if (!Number.isFinite(parsed)) {
    return fallback.toISOString();
  }

  const expiresAt = new Date(parsed);
  expiresAt.setUTCHours(23, 59, 59, 999);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
  return expiresAt.toISOString();
};

const buildTicketToken = (
  payload: Omit<TicketTokenPayload, 'typ' | 'v'>,
  expiresAtIso: string
) => {
  return jwt.sign(
    {
      typ: 'event_ticket',
      v: 1,
      ticketId: payload.ticketId,
      eventId: payload.eventId,
      userId: payload.userId,
      bookingRef: payload.bookingRef,
    } satisfies TicketTokenPayload,
    JWT_SECRET,
    { expiresIn: Math.max(60, Math.floor((Date.parse(expiresAtIso) - Date.now()) / 1000)) }
  );
};

const buildTicketQrPayload = (token: string) => JSON.stringify({ type: TICKET_QR_TYPE, token });

const toVerificationStatus = (value: string | null | undefined): VerificationStatus => {
  return value === 'VERIFIED_ATTENDANCE' || value === 'verified' ? 'VERIFIED_ATTENDANCE' : 'PENDING_VERIFICATION';
};

const toLegacyTicketStatus = (value: string | null | undefined): 'pending' | 'verified' => {
  return value === 'VERIFIED_ATTENDANCE' || value === 'verified' ? 'verified' : 'pending';
};

const withTicketStatusFields = (ticket: any) => {
  if (!ticket) return ticket;
  const verificationStatus = toVerificationStatus(ticket.verification_status || ticket.status);
  return {
    ...ticket,
    status: toLegacyTicketStatus(verificationStatus),
    verification_status: verificationStatus,
  };
};

const parseTicketQrPayload = (rawText: string): { token: string | null; legacyBookingRef: string | null } => {
  if (!rawText) return { token: null, legacyBookingRef: null };
  try {
    const parsed = JSON.parse(rawText);
    if (parsed?.type === TICKET_QR_TYPE && typeof parsed?.token === 'string') {
      return { token: parsed.token, legacyBookingRef: null };
    }
  } catch {
    // Legacy scanner fallback accepts plain booking reference values.
  }

  if (/^EVT-[A-Z0-9]+$/.test(rawText.trim())) {
    return { token: null, legacyBookingRef: rawText.trim() };
  }

  return { token: null, legacyBookingRef: null };
};

const authMiddleware: express.RequestHandler = (req: AuthedRequest, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub?: string; role?: UserRole };
    if (decoded?.sub && decoded?.role) {
      req.auth = { userId: decoded.sub, role: decoded.role };
    }
  } catch {
    // Keep requests unauthenticated when token is invalid.
  }

  next();
};

const requireAuth: express.RequestHandler = (req: AuthedRequest, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const requireRole = (...allowedRoles: UserRole[]): express.RequestHandler => {
  return (req: AuthedRequest, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

const requireSelfOrRole = (paramName: string, allowedRoles: UserRole[] = []): express.RequestHandler => {
  return (req: AuthedRequest, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.auth.userId === String(req.params[paramName])) {
      return next();
    }

    if (allowedRoles.includes(req.auth.role)) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden' });
  };
};

const requireSponsorProfile: express.RequestHandler = (req: AuthedRequest, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const sponsor = db.prepare('SELECT * FROM sponsors WHERE user_id = ?').get(req.auth.userId) as any;
  if (!sponsor) {
    return res.status(403).json({ error: 'Sponsor profile required' });
  }
  if (!sponsor.approved) {
    return res.status(403).json({ error: 'Sponsor account is not approved' });
  }

  return next();
};

const signAccessToken = (userId: string, role: UserRole) => {
  return jwt.sign({ role }, JWT_SECRET, { subject: userId, expiresIn: '24h' });
};

const isHashedPassword = (value: string) => /^\$2[abxy]?\$\d{2}\$/.test(value);

const getLocalIpv4Addresses = (): string[] => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)];
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || '3000');
  const HOST = process.env.HOST || '0.0.0.0';
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const communityClients = new Map<string, Set<WebSocket>>();
  const userClients = new Map<string, Set<WebSocket>>();

  const addUserSocket = (userId: string, ws: WebSocket) => {
    if (!userClients.has(userId)) userClients.set(userId, new Set());
    userClients.get(userId)!.add(ws);
  };

  const removeUserSocket = (userId: string, ws: WebSocket) => {
    userClients.get(userId)?.delete(ws);
    if (userClients.get(userId)?.size === 0) userClients.delete(userId);
  };

  const sendToUser = (userId: string, payload: any) => {
    const sockets = userClients.get(userId);
    if (!sockets) return;
    const message = JSON.stringify(payload);
    sockets.forEach((s) => {
      if (s.readyState === WebSocket.OPEN) s.send(message);
    });
  };

  const createNotification = (
    userId: string,
    type: string,
    title: string,
    message: string,
    data: any = null,
    dedupeKey: string | null = null
  ) => {
    const id = uuidv4();
    try {
      db.prepare(
        'INSERT INTO notifications (id, user_id, type, title, message, data_json, is_read, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(id, userId, type, title, message, data ? JSON.stringify(data) : null, dedupeKey);
    } catch (error: any) {
      const isDuplicateDedupeKey =
        !!dedupeKey &&
        isSqliteConstraintError(error) &&
        String(error?.message || '').includes('notifications.user_id, notifications.dedupe_key');
      if (isDuplicateDedupeKey) {
        return;
      }
      console.error('notification_insert_failed', {
        userId,
        type,
        dedupeKey,
        error: String(error?.message || error),
      });
      return;
    }

    sendToUser(userId, {
      type: 'notification',
      data: {
        id,
        user_id: userId,
        type,
        title,
        message,
        data_json: data,
        is_read: 0,
        created_at: new Date().toISOString(),
      },
    });
  };

  const recordCheckIn = (bookingId: string, eventId: string, checkedInBy: string, source: 'scanner' | 'manual' | 'api' = 'api') => {
    const id = uuidv4();
    db.prepare(
      'INSERT OR IGNORE INTO check_ins (id, booking_id, event_id, checked_in_by, check_in_source) VALUES (?, ?, ?, ?, ?)'
    ).run(id, bookingId, eventId, checkedInBy, source);
  };

  const getTicketByTicketId = (ticketId: string) => {
    return db
      .prepare(
        `
          SELECT
            t.*,
            b.booking_ref,
            b.checked_in,
            b.checked_in_at,
            b.checked_in_by,
            e.name as event_name,
            e.date as event_date,
            e.status as event_status,
            e.host_id,
            u.name as user_name,
            u.email as user_email
          FROM tickets t
          JOIN bookings b ON b.id = t.booking_id
          JOIN events e ON e.id = t.event_id
          JOIN users u ON u.id = t.user_id
          WHERE t.ticket_id = ?
        `
      )
      .get(ticketId) as any;
  };

  const getTicketByBookingRef = (bookingRef: string, eventId?: string) => {
    const clause = eventId ? 'AND b.event_id = ?' : '';
    const params = eventId ? [bookingRef, eventId] : [bookingRef];
    return db
      .prepare(
        `
          SELECT
            t.ticket_id
          FROM bookings b
          JOIN tickets t ON t.booking_id = b.id
          WHERE b.booking_ref = ? ${clause}
          LIMIT 1
        `
      )
      .get(...params) as any;
  };

  const broadcastTicketUpdate = (ticket: any) => {
    const normalized = withTicketStatusFields(ticket);
    const payload = {
      type: 'ticket_verified',
      data: {
        ticketId: normalized.ticket_id,
        bookingId: normalized.booking_id,
        eventId: normalized.event_id,
        userId: normalized.user_id,
        userName: normalized.user_name || 'Attendee',
        ticketType: normalized.ticket_type_name || 'Standard',
        status: normalized.status,
        verificationStatus: normalized.verification_status,
        verifiedAt: normalized.verified_at,
      },
    };

    sendToUser(normalized.user_id, payload);
    if (normalized.host_id) sendToUser(normalized.host_id, payload);

    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as Array<{ id: string }>;
    admins.forEach((admin) => sendToUser(admin.id, payload));
  };

  const verifyTicketByTicketId = (
    ticketId: string,
    verifierId: string,
    verifierRole: UserRole,
    source: 'scanner' | 'manual' | 'api',
    expectedEventId?: string
  ): TicketVerifyResult => {
    const ticket = getTicketByTicketId(ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found', statusCode: 404 };
    }

    if (expectedEventId && ticket.event_id !== expectedEventId) {
      return { success: false, error: 'Wrong event scan', statusCode: 400 };
    }

    if (verifierRole !== 'admin' && ticket.host_id !== verifierId) {
      return { success: false, error: 'Unauthorized check-in request', statusCode: 403 };
    }

    if (ticket.expires_at && Date.parse(ticket.expires_at) < Date.now()) {
      return { success: false, error: 'Ticket expired', statusCode: 410 };
    }

    if (ticket.event_status === 'cancelled') {
      return { success: false, error: 'Event is cancelled', statusCode: 400 };
    }


    if (ticket.status === 'verified') {
      return { success: true, alreadyCheckedIn: true, ticket: withTicketStatusFields(ticket) };
    }

    try {
      db.transaction(() => {
        const update = db
          .prepare(
            `
              UPDATE tickets
              SET status = 'verified', verification_status = 'VERIFIED_ATTENDANCE', verified_at = CURRENT_TIMESTAMP, verified_by = ?
              WHERE id = ? AND status = 'pending'
            `
          )
          .run(verifierId, ticket.id);

        if (update.changes === 0) {
          throw new Error('VERIFY_CONFLICT');
        }

        db.prepare('UPDATE bookings SET checked_in = 1, checked_in_at = CURRENT_TIMESTAMP, checked_in_by = ? WHERE id = ? AND checked_in = 0').run(
          verifierId,
          ticket.booking_id
        );

        recordCheckIn(ticket.booking_id, ticket.event_id, verifierId, source);
      })();
    } catch (error: any) {
      if (error?.message === 'VERIFY_CONFLICT') {
        const latest = withTicketStatusFields(getTicketByTicketId(ticketId));
        if (latest?.status === 'verified') {
          return { success: true, alreadyCheckedIn: true, ticket: latest };
        }
      }
      return { success: false, error: 'Failed to verify ticket', statusCode: 500 };
    }

    const updated = withTicketStatusFields(getTicketByTicketId(ticketId));
    if (updated) {
      createNotification(
        updated.user_id,
        'ticket_verified',
        'Attendance verified',
        `Your attendance for ${updated.event_name} has been verified.`,
        { eventId: updated.event_id, ticketId: updated.ticket_id },
        `ticket-verified-${updated.ticket_id}`
      );
      broadcastTicketUpdate(updated);
    }

    return { success: true, ticket: updated };
  };

  const issueTicketForBooking = async (booking: any, eventDate?: string | null) => {
    const ticketId = generateTicketId();
    const expiresAt = buildTicketExpiryIso(eventDate || null);
    const token = buildTicketToken(
      {
        ticketId,
        eventId: booking.event_id,
        userId: booking.user_id,
        bookingRef: booking.booking_ref,
      },
      expiresAt
    );
    const qrPayload = buildTicketQrPayload(token);
    const qrCode = await QRCode.toDataURL(qrPayload);

    db.prepare(
      `
        INSERT INTO tickets (id, ticket_id, booking_id, user_id, event_id, status, verification_status, issued_at, expires_at, qr_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
      `
    ).run(
      uuidv4(),
      ticketId,
      booking.id,
      booking.user_id,
      booking.event_id,
      booking.checked_in ? 'verified' : 'pending',
      booking.checked_in ? 'VERIFIED_ATTENDANCE' : 'PENDING_VERIFICATION',
      expiresAt,
      token
    );

    db.prepare('UPDATE bookings SET qr_code = ? WHERE id = ?').run(qrCode, booking.id);
    return { ticketId, qrCode };
  };

  const backfillMissingTickets = async () => {
    const missing = db
      .prepare(
        `
          SELECT b.*, e.date as event_date
          FROM bookings b
          JOIN events e ON e.id = b.event_id
          LEFT JOIN tickets t ON t.booking_id = b.id
          WHERE t.id IS NULL
        `
      )
      .all() as any[];

    for (const booking of missing) {
      await issueTicketForBooking(booking, booking.event_date);
      if (booking.checked_in) {
        db.prepare("UPDATE tickets SET status = 'verified', verification_status = 'VERIFIED_ATTENDANCE', verified_at = COALESCE(?, CURRENT_TIMESTAMP), verified_by = ? WHERE booking_id = ?")
          .run(booking.checked_in_at || null, booking.checked_in_by || null, booking.id);
      }
    }
  };

  const promoteNextWaitlistForEvent = (eventId: string) => {
    return db.transaction(() => {
      const next = db
        .prepare(
          `
            SELECT w.*
            FROM waitlist w
            WHERE w.event_id = ? AND w.status = 'waiting'
            ORDER BY w.created_at ASC, w.id ASC
            LIMIT 1
          `
        )
        .get(eventId) as any;

      if (!next) {
        return null;
      }

      db.prepare('UPDATE waitlist SET status = ?, promoted_at = CURRENT_TIMESTAMP WHERE id = ?').run('promoted', next.id);

      createNotification(next.user_id, 'waitlist_promotion', 'You are off the waitlist', 'A seat is now available for your event.', {
        eventId,
        waitlistId: next.id,
      });

      return { ...next, status: 'promoted' };
    })();
  };

  const analyticsCache = new Map<string, { expiresAt: number; payload: any }>();
  const analyticsCacheTtlMs = 60 * 1000;

  const getAnalyticsCache = (key: string) => {
    const hit = analyticsCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      analyticsCache.delete(key);
      return null;
    }
    return hit.payload;
  };

  const setAnalyticsCache = (key: string, payload: any, ttlMs = analyticsCacheTtlMs) => {
    analyticsCache.set(key, { expiresAt: Date.now() + ttlMs, payload });
  };

  const invalidateEventAnalyticsCache = (eventId: string) => {
    const prefix = `event:${eventId}:`;
    Array.from(analyticsCache.keys()).forEach((key) => {
      if (key.startsWith(prefix)) analyticsCache.delete(key);
    });
  };

  const windowStartForType = (windowType: string) => {
    if (windowType === 'all') return null;
    const now = Date.now();
    const days = windowType === '7d' ? 7 : windowType === '90d' ? 90 : 30;
    return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  };

  const buildEventAnalyticsSnapshot = (eventId: string, windowType: '7d' | '30d' | '90d' | 'all' = '30d') => {
    const eventRow = db.prepare('SELECT id, series_id FROM events WHERE id = ?').get(eventId) as any;
    const startAt = windowStartForType(windowType);
    const bookingWindowClause = startAt ? ' AND b.created_at >= ?' : '';
    const bookingWindowParams = startAt ? [eventId, startAt] : [eventId];

    const bookingStats = db
      .prepare(
        `
          SELECT
            COUNT(DISTINCT b.id) AS total_registrations,
            SUM(CASE WHEN b.status != 'cancelled' THEN b.quantity ELSE 0 END) AS tickets_sold,
            SUM(CASE WHEN b.status != 'cancelled' THEN b.total_price ELSE 0 END) AS gross_revenue
          FROM bookings b
          WHERE b.event_id = ?${bookingWindowClause}
        `
      )
      .get(...bookingWindowParams) as any;

    const engagementWindowClause = startAt ? ' AND ee.created_at >= ?' : '';
    const engagementWindowParams = startAt ? [eventId, startAt] : [eventId];
    const engagementStats = db
      .prepare(
        `
          SELECT
            COUNT(CASE WHEN ee.event_type = 'view' THEN 1 END) AS total_views,
            COUNT(CASE WHEN ee.event_type IN ('click', 'sponsor_cta_click') THEN 1 END) AS total_clicks,
            COUNT(DISTINCT CASE WHEN ee.event_type = 'view' THEN COALESCE(ee.actor_user_id, ee.session_id) END) AS unique_views
          FROM event_engagement_events ee
          WHERE ee.event_id = ?${engagementWindowClause}
        `
      )
      .get(...engagementWindowParams) as any;

    const demographics = db
      .prepare(
        `
          SELECT u.role, COUNT(*) AS count
          FROM bookings b
          JOIN users u ON u.id = b.user_id
          WHERE b.event_id = ?${bookingWindowClause}
          GROUP BY u.role
        `
      )
      .all(...bookingWindowParams) as any[];

    const totalRegistrations = Number(bookingStats?.total_registrations || 0);
    const ticketsSold = Number(bookingStats?.tickets_sold || 0);
    const grossRevenue = Number(bookingStats?.gross_revenue || 0);
    const uniqueViews = Number(engagementStats?.unique_views || 0);
    const totalClicks = Number(engagementStats?.total_clicks || 0);
    const conversionRate = uniqueViews > 0 ? Number(((totalRegistrations / uniqueViews) * 100).toFixed(2)) : 0;

    return {
      event_id: eventId,
      series_id: eventRow?.series_id || null,
      window_type: windowType,
      total_registrations: totalRegistrations,
      tickets_sold: ticketsSold,
      gross_revenue: grossRevenue,
      engagement: {
        unique_views: uniqueViews,
        views: Number(engagementStats?.total_views || 0),
        clicks: totalClicks,
      },
      conversion_rate: conversionRate,
      audience_demographics: demographics,
      computed_at: new Date().toISOString(),
    };
  };

  const upsertEventAnalyticsSnapshot = (snapshot: any) => {
    db.prepare(
      `
        INSERT INTO event_analytics (
          id, event_id, series_id, window_type, total_registrations, tickets_sold, gross_revenue,
          unique_views, cta_clicks, conversion_rate, demographics_json, computed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
    ).run(
      uuidv4(),
      snapshot.event_id,
      snapshot.series_id || null,
      snapshot.window_type,
      snapshot.total_registrations,
      snapshot.tickets_sold,
      snapshot.gross_revenue,
      snapshot.engagement.unique_views,
      snapshot.engagement.clicks,
      snapshot.conversion_rate,
      JSON.stringify(snapshot.audience_demographics || [])
    );
  };

  const getEventAnalytics = (eventId: string, windowType: '7d' | '30d' | '90d' | 'all' = '30d') => {
    const cacheKey = `event:${eventId}:${windowType}`;
    const cached = getAnalyticsCache(cacheKey);
    if (cached) return cached;

    const latest = db
      .prepare(
        `
          SELECT *
          FROM event_analytics
          WHERE event_id = ? AND window_type = ?
          ORDER BY computed_at DESC
          LIMIT 1
        `
      )
      .get(eventId, windowType) as any;

    if (latest && Date.now() - Date.parse(latest.computed_at) < analyticsCacheTtlMs) {
      const hydrated = {
        event_id: latest.event_id,
        window_type: latest.window_type,
        total_registrations: Number(latest.total_registrations || 0),
        tickets_sold: Number(latest.tickets_sold || 0),
        gross_revenue: Number(latest.gross_revenue || 0),
        engagement: {
          unique_views: Number(latest.unique_views || 0),
          views: Number(latest.unique_views || 0),
          clicks: Number(latest.cta_clicks || 0),
        },
        conversion_rate: Number(latest.conversion_rate || 0),
        audience_demographics: safeJson(latest.demographics_json, []),
        computed_at: latest.computed_at,
      };
      setAnalyticsCache(cacheKey, hydrated);
      return hydrated;
    }

    const snapshot = buildEventAnalyticsSnapshot(eventId, windowType);
    upsertEventAnalyticsSnapshot(snapshot);
    setAnalyticsCache(cacheKey, snapshot);
    return snapshot;
  };

  const rollupAllEventAnalytics = () => {
    const events = db.prepare('SELECT id FROM events WHERE status = ?').all('approved') as Array<{ id: string }>;
    events.forEach((event) => {
      (['7d', '30d', '90d', 'all'] as Array<'7d' | '30d' | '90d' | 'all'>).forEach((windowType) => {
        const snapshot = buildEventAnalyticsSnapshot(event.id, windowType);
        upsertEventAnalyticsSnapshot(snapshot);
        setAnalyticsCache(`event:${event.id}:${windowType}`, snapshot);
      });
    });
  };

  const canViewEventAnalytics = (role: UserRole, actorId: string, event: any) => {
    if (role === 'admin') return true;
    if (role === 'host') return event.host_id === actorId;
    if (role === 'sponsor') {
      if (event.status !== 'approved') return false;
      const sponsor = db.prepare('SELECT id FROM sponsors WHERE user_id = ? AND approved = 1').get(actorId) as any;
      if (!sponsor?.id) return false;

      const hasUnifiedDeal = db
        .prepare('SELECT 1 as ok FROM deals WHERE event_id = ? AND sponsor_id = ? LIMIT 1')
        .get(event.id, sponsor.id) as any;
      if (hasUnifiedDeal?.ok) return true;

      const hasUnifiedRequest = db
        .prepare('SELECT 1 as ok FROM sponsorship_requests WHERE event_id = ? AND sponsor_id = ? LIMIT 1')
        .get(event.id, sponsor.id) as any;
      if (hasUnifiedRequest?.ok) return true;

      const hasLegacyDeal = db
        .prepare('SELECT 1 as ok FROM sponsorship_deals WHERE event_id = ? AND sponsor_id = ? LIMIT 1')
        .get(event.id, sponsor.id) as any;
      if (hasLegacyDeal?.ok) return true;

      const hasBid = db
        .prepare(
          `
            SELECT 1 as ok
            FROM bids b
            JOIN sponsor_spots ss ON ss.id = b.spot_id
            WHERE ss.event_id = ? AND b.sponsor_id = ?
            LIMIT 1
          `
        )
        .get(event.id, sponsor.id) as any;
      return !!hasBid?.ok;
    }
    return false;
  };

  const getEventSponsorMetrics = (eventId: string) => {
    const metrics = db
      .prepare(
        `
          SELECT
            COUNT(DISTINCT b.id) AS registrations,
            SUM(CASE WHEN b.checked_in = 1 THEN b.quantity ELSE 0 END) AS attendees,
            SUM(b.quantity) AS booked_quantity
          FROM bookings b
          WHERE b.event_id = ?
        `
      )
      .get(eventId) as any;

    const registrations = Number(metrics?.registrations || 0);
    const attendees = Number(metrics?.attendees || 0);
    const bookedQuantity = Number(metrics?.booked_quantity || 0);
    const conversionRate = bookedQuantity > 0 ? Number(((attendees / bookedQuantity) * 100).toFixed(2)) : 0;

    return { registrations, attendees, conversionRate };
  };

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const communityId = url.searchParams.get('communityId');
    const userId = url.searchParams.get('userId');

    if (userId) addUserSocket(userId, ws);

    if (communityId && userId) {
      if (!communityClients.has(communityId)) {
        communityClients.set(communityId, new Set());
      }
      communityClients.get(communityId)!.add(ws);
    }

    ws.on('close', () => {
      if (userId) removeUserSocket(userId, ws);
      if (communityId) {
        communityClients.get(communityId)?.delete(ws);
        if (communityClients.get(communityId)?.size === 0) {
          communityClients.delete(communityId);
        }
      }
    });
  });

  // Seed analytics snapshots on startup and keep rolling windows precomputed.
  rollupAllEventAnalytics();
  setInterval(() => {
    rollupAllEventAnalytics();
  }, 5 * 60 * 1000);

  app.use(express.json());
  app.use(authMiddleware);
  app.use('/uploads', express.static(uploadDir));

  const defaultLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
  const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
  const bookingLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40 });
  const ticketScanLimiter = rateLimit({ windowMs: 60 * 1000, max: 80 });
  const searchLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 120 });

  app.use('/api', defaultLimiter);
  await backfillMissingTickets();

  // Auth
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let passwordMatches = false;
    if (isHashedPassword(user.password)) {
      passwordMatches = await bcrypt.compare(password, user.password);
    } else {
      passwordMatches = user.password === password;
      if (passwordMatches) {
        const upgradedHash = await bcrypt.hash(password, 12);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(upgradedHash, user.id);
        user.password = upgradedHash;
      }
    }

    if (passwordMatches) {
      const token = signAccessToken(user.id, user.role);
      const { password: pwd, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, token });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = req.body?.role;
    const host_org_name = req.body?.host_org_name ? String(req.body.host_org_name).trim() : null;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['student', 'host', 'sponsor'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const id = uuidv4();

    let referralCode = generateReferralCode();
    let attempts = 0;
    while (db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referralCode) && attempts < 10) {
      referralCode = generateReferralCode();
      attempts += 1;
    }
    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate referral code' });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      db.prepare(
        'INSERT INTO users (id, name, email, password, role, host_org_name, referral_code) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, name, email, passwordHash, role, host_org_name, referralCode);

      if (role === 'sponsor') {
        db.prepare(
          'INSERT INTO sponsors (id, user_id, company_name, website, contact_email, approved) VALUES (?, ?, ?, ?, ?, 1)'
        ).run(uuidv4(), id, host_org_name || `${name} Sponsor`, null, email);
      }

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      const token = signAccessToken(user.id, user.role);
      const { password: pwd, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, token });
    } catch (e) {
      res.status(400).json({ error: 'Email already exists' });
    }
  });

  app.post('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const { name, bio } = req.body;
    const id = req.auth!.userId;
    try {
      db.prepare('UPDATE users SET name = ?, bio = ? WHERE id = ?').run(name, bio, id);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      const { password: pwd, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (e) {
      res.status(400).json({ error: 'Failed to update profile' });
    }
  });

  app.get('/api/users/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: pwd, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.post('/api/users/:id/avatar', requireSelfOrRole('id', ['admin']), upload.single('avatar'), (req, res) => {
    const profileId = req.params.id;
    const avatar = req.file ? `/uploads/${req.file.filename}` : null;
    if (!avatar) return res.status(400).json({ error: 'Missing avatar file' });

    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, profileId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(profileId) as any;
    const { password: pwd, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // Search and discovery
  app.get('/api/search', searchLimiter, (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);

    const rows = db
      .prepare(
        `
          SELECT e.*, c.name as category_name, u.name as host_name
          FROM events_fts f
          JOIN events e ON e.id = f.event_id
          JOIN categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.host_id
          WHERE events_fts MATCH ? AND e.status = 'approved'
          ORDER BY bm25(events_fts)
          LIMIT 50
        `
      )
      .all(`${q}*`);
    res.json(rows);
  });

  app.get('/api/search/autocomplete', searchLimiter, (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const suggestions = db
      .prepare('SELECT DISTINCT name FROM events WHERE status = ? AND name LIKE ? ORDER BY name LIMIT 8')
      .all('approved', `%${q}%`)
      .map((r: any) => r.name);
    res.json(suggestions);
  });

  app.get('/api/recommendations/user/:userId', (req, res) => {
    const userId = req.params.userId;
    const preferred = db
      .prepare(
        `
          SELECT e.category_id, COUNT(*) as score
          FROM bookings b
          JOIN events e ON e.id = b.event_id
          WHERE b.user_id = ?
          GROUP BY e.category_id
          ORDER BY score DESC
          LIMIT 3
        `
      )
      .all(userId) as Array<{ category_id: string; score: number }>;

    if (!preferred.length) {
      const fallback = db
        .prepare(
          `
          SELECT e.*, c.name as category_name, u.name as host_name
          FROM events e
          JOIN categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.host_id
          WHERE e.status = 'approved'
          ORDER BY e.featured DESC, e.date ASC
          LIMIT 8
        `
        )
        .all();
      return res.json(fallback);
    }

    const categoryIds = preferred.map((p) => p.category_id);
    const placeholders = categoryIds.map(() => '?').join(', ');
    const recommendations = db
      .prepare(
        `
          SELECT e.*, c.name as category_name, u.name as host_name
          FROM events e
          JOIN categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.host_id
          WHERE e.status = 'approved'
            AND e.category_id IN (${placeholders})
            AND e.id NOT IN (SELECT event_id FROM bookings WHERE user_id = ?)
          ORDER BY e.featured DESC, e.date ASC
          LIMIT 12
        `
      )
      .all(...categoryIds, userId);

    res.json(recommendations);
  });

  // Events
  app.get('/api/events', (req, res) => {
    const { category, venue, startDate, endDate, hostId } = req.query;
    let query = `
      SELECT e.*, c.name as category_name, u.name as host_name
      FROM events e
      JOIN categories c ON e.category_id = c.id
      JOIN users u ON e.host_id = u.id
      WHERE 1 = 1
    `;
    const params: any[] = [];

    if (!hostId) {
      query += ` AND e.status = 'approved'`;
    }
    if (hostId) {
      query += ` AND e.host_id = ?`;
      params.push(hostId);
    }
    if (category) {
      query += ` AND e.category_id = ?`;
      params.push(category);
    }
    if (venue) {
      query += ` AND e.venue LIKE ?`;
      params.push(`%${venue}%`);
    }
    if (startDate) {
      query += ` AND e.date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND e.date <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY e.date ASC`;

    const events = db.prepare(query).all(...params);
    res.json(events);
  });

  app.get('/api/events/map', (req, res) => {
    const lat = parseNum(req.query.lat, NaN);
    const lng = parseNum(req.query.lng, NaN);
    const radiusKm = parseNum(req.query.radiusKm, 30);

    const events = db
      .prepare(
        `
          SELECT e.*, c.name as category_name, u.name as host_name
          FROM events e
          JOIN categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.host_id
          WHERE e.status = 'approved' AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        `
      )
      .all() as any[];

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.json(events);
    }

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const inRadius = events.filter((e) => {
      const dLat = toRad(e.latitude - lat);
      const dLng = toRad(e.longitude - lng);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat)) * Math.cos(toRad(e.latitude)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371 * c;
      return distance <= radiusKm;
    });

    res.json(inRadius);
  });

  app.get('/api/events/:id', (req, res) => {
    const event = db
      .prepare(
        `
      SELECT e.*, c.name as category_name, u.name as host_name
      FROM events e
      JOIN categories c ON e.category_id = c.id
      JOIN users u ON e.host_id = u.id
      WHERE e.id = ?
    `
      )
      .get(req.params.id) as any;

    if (event) {
      const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(req.params.id);
      const reviews = db
        .prepare(
          `
        SELECT r.*, u.name as user_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.event_id = ?
      `
        )
        .all(req.params.id);
      const faqs = db.prepare('SELECT * FROM faqs WHERE event_id = ?').all(req.params.id);
      res.json({ ...event, ticketTypes, reviews, faqs });
    } else {
      res.status(404).json({ error: 'Event not found' });
    }
  });

  app.post('/api/events', requireRole('host', 'admin'), upload.single('image'), (req: AuthedRequest, res) => {
    const { host_id, name, description, date, venue, category_id, total_seats, ticketTypes, faqs, latitude, longitude } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const id = uuidv4();
    const seats = parseInt(total_seats) || 0;
    const actorId = req.auth!.userId;
    const actorRole = req.auth!.role;
    if (actorRole !== 'admin' && host_id && host_id !== actorId) {
      return res.status(403).json({ error: 'Unauthorized host context' });
    }
    const effectiveHostId = host_id || actorId;

    try {
      db.transaction(() => {
        db.prepare(
          'INSERT INTO events (id, host_id, name, description, date, venue, category_id, total_seats, available_seats, status, image, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, effectiveHostId, name, description, date, venue, category_id, seats, seats, 'pending', image, latitude || null, longitude || null);

        if (ticketTypes) {
          const parsedTicketTypes = JSON.parse(ticketTypes);
          const insertTicket = db.prepare('INSERT INTO ticket_types (id, event_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)');
          parsedTicketTypes.forEach((tt: any) => {
            insertTicket.run(uuidv4(), id, tt.name, tt.price, tt.quantity);
          });
        }

        if (faqs) {
          const parsedFaqs = JSON.parse(faqs);
          const insertFaq = db.prepare('INSERT INTO faqs (id, event_id, question, answer) VALUES (?, ?, ?, ?)');
          parsedFaqs.forEach((f: any) => {
            insertFaq.run(uuidv4(), id, f.question, f.answer);
          });
        }
      })();
      db.prepare('DELETE FROM events_fts WHERE event_id = ?').run(id);
      db.prepare('INSERT INTO events_fts(event_id, name, description, venue, category_name) VALUES (?, ?, ?, ?, ?)').run(
        id,
        name,
        description || '',
        venue || '',
        db.prepare('SELECT name FROM categories WHERE id = ?').get(category_id)?.name || ''
      );
      res.json({ id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  app.put('/api/events/:id', requireRole('host', 'admin'), upload.single('image'), (req: AuthedRequest, res) => {
    const eventId = req.params.id;
    const {
      host_id,
      name,
      description,
      date,
      venue,
      category_id,
      ticketTypes,
      faqs,
      latitude,
      longitude,
      status,
    } = req.body;

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) return res.status(403).json({ error: 'Unauthorized' });

    const nextImage = req.file ? `/uploads/${req.file.filename}` : event.image;

    try {
      db.transaction(() => {
        db.prepare(
          `
          UPDATE events
          SET name = ?, description = ?, date = ?, venue = ?, category_id = ?, image = ?, latitude = ?, longitude = ?, status = COALESCE(?, status)
          WHERE id = ?
        `
        ).run(
          name ?? event.name,
          description ?? event.description,
          date ?? event.date,
          venue ?? event.venue,
          category_id ?? event.category_id,
          nextImage,
          latitude ?? event.latitude,
          longitude ?? event.longitude,
          status || null,
          eventId
        );

        if (ticketTypes) {
          db.prepare('DELETE FROM ticket_types WHERE event_id = ?').run(eventId);
          const parsedTicketTypes = safeJson(ticketTypes, []);
          const insertTicket = db.prepare('INSERT INTO ticket_types (id, event_id, name, price, quantity, sold) VALUES (?, ?, ?, ?, ?, ?)');
          parsedTicketTypes.forEach((tt: any) => {
            insertTicket.run(uuidv4(), eventId, tt.name, tt.price, tt.quantity, 0);
          });
        }

        if (faqs) {
          db.prepare('DELETE FROM faqs WHERE event_id = ?').run(eventId);
          const parsedFaqs = safeJson(faqs, []);
          const insertFaq = db.prepare('INSERT INTO faqs (id, event_id, question, answer) VALUES (?, ?, ?, ?)');
          parsedFaqs.forEach((f: any) => {
            insertFaq.run(uuidv4(), eventId, f.question, f.answer);
          });
        }
      })();

      const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      const categoryName = db.prepare('SELECT name FROM categories WHERE id = ?').get((updated as any).category_id)?.name || '';
      db.prepare('DELETE FROM events_fts WHERE event_id = ?').run(eventId);
      db.prepare('INSERT INTO events_fts(event_id, name, description, venue, category_name) VALUES (?, ?, ?, ?, ?)').run(
        eventId,
        (updated as any).name,
        (updated as any).description || '',
        (updated as any).venue || '',
        categoryName
      );

      const attendees = db.prepare('SELECT DISTINCT user_id FROM bookings WHERE event_id = ?').all(eventId) as Array<{ user_id: string }>;
      attendees.forEach((a) => {
        createNotification(a.user_id, 'event_update', 'Event updated', `An event you booked was updated: ${(updated as any).name}`, { eventId });
      });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to update event' });
    }
  });

  app.post('/api/events/:id/duplicate', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const source = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    const { date } = req.body;
    if (!source) return res.status(404).json({ error: 'Source event not found' });
    if (req.auth!.role !== 'admin' && source.host_id !== req.auth!.userId) return res.status(403).json({ error: 'Unauthorized' });

    const newEventId = uuidv4();
    db.transaction(() => {
      db.prepare(
        `
          INSERT INTO events (id, host_id, name, description, date, venue, category_id, image, status, featured, total_seats, available_seats, latitude, longitude, series_id, recurrence_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        newEventId,
        source.host_id,
        `${source.name} (Copy)`,
        source.description,
        date || source.date,
        source.venue,
        source.category_id,
        source.image,
        'pending',
        0,
        source.total_seats,
        source.total_seats,
        source.latitude,
        source.longitude,
        source.series_id,
        source.recurrence_type || 'none'
      );

      const tickets = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(source.id) as any[];
      const insertTicket = db.prepare('INSERT INTO ticket_types (id, event_id, name, price, quantity, sold) VALUES (?, ?, ?, ?, ?, 0)');
      tickets.forEach((tt) => insertTicket.run(uuidv4(), newEventId, tt.name, tt.price, tt.quantity));

      const faqs = db.prepare('SELECT * FROM faqs WHERE event_id = ?').all(source.id) as any[];
      const insertFaq = db.prepare('INSERT INTO faqs (id, event_id, question, answer) VALUES (?, ?, ?, ?)');
      faqs.forEach((f) => insertFaq.run(uuidv4(), newEventId, f.question, f.answer));
    })();

    res.json({ id: newEventId });
  });

  app.post('/api/events/:id/recurring', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const source = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    const { recurrence_type, count } = req.body;

    if (!source) return res.status(404).json({ error: 'Source event not found' });
    if (req.auth!.role !== 'admin' && source.host_id !== req.auth!.userId) return res.status(403).json({ error: 'Unauthorized' });
    if (!['weekly', 'monthly'].includes(recurrence_type)) {
      return res.status(400).json({ error: 'Invalid recurrence type' });
    }

    const total = Math.max(1, Math.min(parseInt(count || '4', 10), 24));
    const baseDate = new Date(source.date);
    const seriesId = source.series_id || uuidv4();

    const created: string[] = [];
    db.transaction(() => {
      for (let i = 1; i <= total; i += 1) {
        const d = new Date(baseDate);
        if (recurrence_type === 'weekly') d.setDate(d.getDate() + i * 7);
        if (recurrence_type === 'monthly') d.setMonth(d.getMonth() + i);

        const newId = uuidv4();
        created.push(newId);

        db.prepare(
          `
            INSERT INTO events (id, host_id, name, description, date, venue, category_id, image, status, featured, total_seats, available_seats, latitude, longitude, series_id, recurrence_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          newId,
          source.host_id,
          source.name,
          source.description,
          d.toISOString(),
          source.venue,
          source.category_id,
          source.image,
          'pending',
          0,
          source.total_seats,
          source.total_seats,
          source.latitude,
          source.longitude,
          seriesId,
          recurrence_type
        );

        const tickets = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(source.id) as any[];
        const insertTicket = db.prepare('INSERT INTO ticket_types (id, event_id, name, price, quantity, sold) VALUES (?, ?, ?, ?, ?, 0)');
        tickets.forEach((tt) => insertTicket.run(uuidv4(), newId, tt.name, tt.price, tt.quantity));
      }

      db.prepare('UPDATE events SET series_id = ?, recurrence_type = ? WHERE id = ?').run(seriesId, recurrence_type, source.id);
    })();

    res.json({ success: true, series_id: seriesId, created_ids: created });
  });

  // Reviews
  app.post('/api/reviews', (req, res) => {
    const { user_id, event_id, rating, comment } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO reviews (id, user_id, event_id, rating, comment) VALUES (?, ?, ?, ?, ?)').run(id, user_id, event_id, rating, comment);
      const event = db.prepare('SELECT host_id, name FROM events WHERE id = ?').get(event_id) as any;
      if (event) {
        createNotification(event.host_id, 'review', 'New review posted', `Your event received a review: ${event.name}`, { eventId: event_id });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'You have already reviewed this event' });
    }
  });

  // Discussions
  app.get('/api/events/:id/discussions', (req, res) => {
    const rows = db
      .prepare(
        `
          SELECT d.*, u.name as user_name, u.avatar as user_avatar
          FROM discussions d
          JOIN users u ON u.id = d.user_id
          WHERE d.event_id = ?
          ORDER BY d.created_at ASC
        `
      )
      .all(req.params.id) as any[];

    const roots = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, replies: [] as any[] }));
    const rootsById = new Map(roots.map((r) => [r.id, r]));
    rows
      .filter((r) => r.parent_id)
      .forEach((r) => {
        const parent = rootsById.get(r.parent_id);
        if (parent) parent.replies.push(r);
      });

    res.json(roots);
  });

  app.post('/api/discussions', (req, res) => {
    const { event_id, user_id, message, parent_id } = req.body;
    if (!event_id || !user_id || !message?.trim()) {
      return res.status(400).json({ error: 'Missing discussion fields' });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO discussions (id, event_id, user_id, parent_id, message) VALUES (?, ?, ?, ?, ?)').run(
      id,
      event_id,
      user_id,
      parent_id || null,
      message.trim()
    );

    const discussion = db
      .prepare(
        `
        SELECT d.*, u.name as user_name, u.avatar as user_avatar
        FROM discussions d
        JOIN users u ON u.id = d.user_id
        WHERE d.id = ?
      `
      )
      .get(id);

    const eventHost = db.prepare('SELECT host_id, name FROM events WHERE id = ?').get(event_id) as any;
    if (eventHost && eventHost.host_id !== user_id) {
      createNotification(eventHost.host_id, 'discussion', 'New event discussion', `New comment on ${eventHost.name}`, { eventId: event_id });
    }

    res.json(discussion);
  });

  // Reports
  app.post('/api/reports', (req, res) => {
    const { user_id, event_id, reason } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO reports (id, user_id, event_id, reason) VALUES (?, ?, ?, ?)').run(id, user_id, event_id, reason);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to submit report' });
    }
  });

  // Host and admin analytics
  app.get('/api/analytics/host/:hostId', requireSelfOrRole('hostId', ['admin']), (req, res) => {
    const hostId = req.params.hostId;

    const salesOverTime = db
      .prepare(
        `
          SELECT DATE(b.created_at) as day, SUM(b.total_price) as revenue, SUM(b.quantity) as tickets
          FROM bookings b
          JOIN events e ON e.id = b.event_id
          WHERE e.host_id = ?
          GROUP BY DATE(b.created_at)
          ORDER BY day ASC
        `
      )
      .all(hostId);

    const revenueBreakdown = db
      .prepare(
        `
          SELECT e.name as event_name, SUM(b.total_price) as revenue
          FROM bookings b
          JOIN events e ON e.id = b.event_id
          WHERE e.host_id = ?
          GROUP BY e.id
          ORDER BY revenue DESC
        `
      )
      .all(hostId);

    const attendeeDemographics = db
      .prepare(
        `
          SELECT u.role, COUNT(*) as count
          FROM bookings b
          JOIN events e ON e.id = b.event_id
          JOIN users u ON u.id = b.user_id
          WHERE e.host_id = ?
          GROUP BY u.role
        `
      )
      .all(hostId);

    const categoryTrends = db
      .prepare(
        `
          SELECT c.name as category, COUNT(b.id) as bookings, SUM(b.total_price) as revenue
          FROM bookings b
          JOIN events e ON e.id = b.event_id
          JOIN categories c ON c.id = e.category_id
          WHERE e.host_id = ?
          GROUP BY c.id
          ORDER BY bookings DESC
        `
      )
      .all(hostId);

    res.json({ salesOverTime, revenueBreakdown, attendeeDemographics, categoryTrends });
  });

  app.post('/api/analytics/engagement', (req: AuthedRequest, res) => {
    const eventId = String(req.body?.event_id || '').trim();
    const eventType = String(req.body?.event_type || '').trim();
    const sessionId = req.body?.session_id ? String(req.body.session_id).trim() : null;
    const source = req.body?.source ? String(req.body.source).trim() : 'web';

    if (!eventId || !['view', 'click', 'share', 'sponsor_cta_click'].includes(eventType)) {
      return res.status(400).json({ error: 'Invalid engagement payload' });
    }

    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    db.prepare(
      'INSERT INTO event_engagement_events (id, event_id, actor_user_id, session_id, event_type, source) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), eventId, req.auth?.userId || null, sessionId, eventType, source);

    invalidateEventAnalyticsCache(eventId);
    return res.json({ success: true });
  });

  app.get('/api/events/:id/analytics', requireAuth, (req: AuthedRequest, res) => {
    const event = db.prepare('SELECT id, host_id, status, series_id FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (!canViewEventAnalytics(req.auth!.role, req.auth!.userId, event)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const windowType = String(req.query.window || '30d') as '7d' | '30d' | '90d' | 'all';
    if (!['7d', '30d', '90d', 'all'].includes(windowType)) {
      return res.status(400).json({ error: 'Invalid window value' });
    }

    const analytics = getEventAnalytics(event.id, windowType);
    const historicalPerformance = event.series_id
      ? db
          .prepare(
            `
              SELECT
                ea.event_id,
                e.name as event_name,
                ea.window_type,
                ea.total_registrations,
                ea.tickets_sold,
                ea.gross_revenue,
                ea.conversion_rate,
                ea.computed_at
              FROM event_analytics ea
              JOIN events e ON e.id = ea.event_id
              WHERE e.series_id = ? AND ea.window_type = ?
              ORDER BY ea.computed_at DESC
              LIMIT 30
            `
          )
          .all(event.series_id, windowType)
      : [];

    return res.json({ ...analytics, historical_performance: historicalPerformance });
  });

  app.get('/api/events/:id/analytics/history', requireAuth, (req: AuthedRequest, res) => {
    const event = db.prepare('SELECT id, host_id, status, series_id FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (!canViewEventAnalytics(req.auth!.role, req.auth!.userId, event)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rows = event.series_id
      ? db
          .prepare(
            `
              SELECT ea.*
              FROM event_analytics ea
              JOIN events e ON e.id = ea.event_id
              WHERE e.series_id = ?
              ORDER BY ea.computed_at ASC
            `
          )
          .all(event.series_id)
      : db
          .prepare(
            `
              SELECT *
              FROM event_analytics
              WHERE event_id = ?
              ORDER BY computed_at ASC
            `
          )
          .all(event.id);

    return res.json(rows.map((row: any) => ({ ...row, demographics_json: safeJson(row.demographics_json, []) })));
  });

  app.get('/api/analytics/events', requireAuth, (req: AuthedRequest, res) => {
    const role = req.auth!.role;
    const actorId = req.auth!.userId;
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || '30'), 10) || 30, 100));

    const baseQuery = `
      SELECT e.id, e.name, e.host_id, e.status, e.date, c.name AS category_name, u.name AS host_name
      FROM events e
      JOIN categories c ON c.id = e.category_id
      JOIN users u ON u.id = e.host_id
    `;

    let rows: any[] = [];
    if (role === 'admin') {
      rows = db.prepare(`${baseQuery} ORDER BY e.date DESC LIMIT ?`).all(limit) as any[];
    } else if (role === 'host') {
      rows = db.prepare(`${baseQuery} WHERE e.host_id = ? ORDER BY e.date DESC LIMIT ?`).all(actorId, limit) as any[];
    } else if (role === 'sponsor') {
      rows = db.prepare(`${baseQuery} WHERE e.status = 'approved' ORDER BY e.date DESC LIMIT ?`).all(limit) as any[];
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const payload = rows.map((row) => ({ ...row, analytics: getEventAnalytics(row.id, '30d') }));
    return res.json(payload);
  });

  app.get('/api/analytics/hosts/:hostId/summary', requireSelfOrRole('hostId', ['admin']), (req, res) => {
    const hostId = req.params.hostId;
    const totals = db
      .prepare(
        `
          SELECT
            COUNT(DISTINCT e.id) AS events,
            COUNT(DISTINCT b.id) AS registrations,
            SUM(CASE WHEN b.status != 'cancelled' THEN b.quantity ELSE 0 END) AS tickets_sold,
            SUM(CASE WHEN b.status != 'cancelled' THEN b.total_price ELSE 0 END) AS gross_revenue
          FROM events e
          LEFT JOIN bookings b ON b.event_id = e.id
          WHERE e.host_id = ?
        `
      )
      .get(hostId) as any;

    return res.json({
      host_id: hostId,
      events: Number(totals?.events || 0),
      registrations: Number(totals?.registrations || 0),
      tickets_sold: Number(totals?.tickets_sold || 0),
      gross_revenue: Number(totals?.gross_revenue || 0),
    });
  });

  app.get('/api/admin/analytics/overview', requireRole('admin'), (req, res) => {
    const totals = db
      .prepare(
        `
          SELECT
            COUNT(DISTINCT e.id) AS events,
            COUNT(DISTINCT b.id) AS registrations,
            SUM(CASE WHEN b.status != 'cancelled' THEN b.quantity ELSE 0 END) AS tickets_sold,
            SUM(CASE WHEN b.status != 'cancelled' THEN b.total_price ELSE 0 END) AS gross_revenue
          FROM events e
          LEFT JOIN bookings b ON b.event_id = e.id
        `
      )
      .get() as any;

    return res.json({
      events: Number(totals?.events || 0),
      registrations: Number(totals?.registrations || 0),
      tickets_sold: Number(totals?.tickets_sold || 0),
      gross_revenue: Number(totals?.gross_revenue || 0),
    });
  });

  app.get('/api/admin/sponsorship/requests/pending-count', requireRole('admin'), (req, res) => {
    const row = db
      .prepare('SELECT COUNT(*) as count FROM sponsorship_requests WHERE status = ?')
      .get('pending') as { count?: number };
    return res.json({ pending_count: Number(row?.count || 0) });
  });

  app.get('/api/sponsorship/requests/pending-count', requireAuth, (req: AuthedRequest, res) => {
    const actorId = req.auth!.userId;
    const role = req.auth!.role;
    const box = String(req.query.box || 'incoming');

    if (role === 'admin' && box === 'incoming') {
      const row = db.prepare('SELECT COUNT(*) as count FROM sponsorship_requests WHERE status = ?').get('pending') as { count?: number };
      return res.json({ pending_count: Number(row?.count || 0) });
    }

    const whereClause = box === 'outgoing' ? 'sender_user_id = ? AND status = ?' : 'receiver_user_id = ? AND status = ?';
    const row = db.prepare(`SELECT COUNT(*) as count FROM sponsorship_requests WHERE ${whereClause}`).get(actorId, 'pending') as {
      count?: number;
    };
    return res.json({ pending_count: Number(row?.count || 0) });
  });

  app.get('/api/sponsorship/sponsors', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const actorId = req.auth!.userId;
    const role = req.auth!.role;

    const rows = db
      .prepare(
        `
          SELECT s.*, u.id as user_id, u.name as user_name, u.email as user_email
          FROM sponsors s
          JOIN users u ON u.id = s.user_id
          WHERE s.approved = 1
          ORDER BY s.created_at DESC
          LIMIT 200
        `
      )
      .all() as any[];

    if (role === 'host') {
      const filtered = rows.filter((r) => r.user_id !== actorId);
      return res.json(filtered);
    }

    return res.json(rows);
  });

  app.post('/api/sponsorship/requests', requireAuth, (req: AuthedRequest, res) => {
    const actorId = req.auth!.userId;
    const role = req.auth!.role;
    const eventId = req.body?.event_id ? String(req.body.event_id).trim() : null;
    const sponsorUserId = req.body?.sponsor_user_id ? String(req.body.sponsor_user_id).trim() : null;
    const message = String(req.body?.message || '').trim();
    const proposedAmount = parseNum(req.body?.proposed_amount, 0);

    if (!message) return res.status(400).json({ error: 'message is required' });

    const requestId = uuidv4();
    let direction: 'sponsor_to_host' | 'host_to_sponsor' | 'admin_to_sponsor';
    let senderRole: 'sponsor' | 'host' | 'admin';
    let receiverRole: 'sponsor' | 'host';
    let receiverUserId: string;
    let sponsorId: string | null = null;
    let hostId: string | null = null;

    if (role === 'sponsor') {
      if (!eventId) return res.status(400).json({ error: 'event_id is required for sponsors' });
      const event = db.prepare('SELECT id, host_id, status FROM events WHERE id = ?').get(eventId) as any;
      if (!event || event.status !== 'approved') return res.status(404).json({ error: 'Eligible event not found' });

      const sponsor = db.prepare('SELECT id, approved FROM sponsors WHERE user_id = ?').get(actorId) as any;
      if (!sponsor || !sponsor.approved) return res.status(403).json({ error: 'Approved sponsor profile required' });

      direction = 'sponsor_to_host';
      senderRole = 'sponsor';
      receiverRole = 'host';
      receiverUserId = event.host_id;
      sponsorId = sponsor.id;
      hostId = event.host_id;
    } else if (role === 'host' || role === 'admin') {
      if (!sponsorUserId || !eventId) {
        return res.status(400).json({ error: 'sponsor_user_id and event_id are required' });
      }

      const sponsor = db.prepare('SELECT id, user_id, approved FROM sponsors WHERE user_id = ?').get(sponsorUserId) as any;
      if (!sponsor || !sponsor.approved) return res.status(404).json({ error: 'Approved sponsor not found' });

      const event = db.prepare('SELECT id, host_id FROM events WHERE id = ?').get(eventId) as any;
      if (!event) return res.status(404).json({ error: 'Event not found' });
      if (role !== 'admin' && event.host_id !== actorId) {
        return res.status(403).json({ error: 'Forbidden for this event' });
      }

      direction = role === 'admin' ? 'admin_to_sponsor' : 'host_to_sponsor';
      senderRole = role;
      receiverRole = 'sponsor';
      receiverUserId = sponsor.user_id;
      sponsorId = sponsor.id;
      hostId = event.host_id;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.prepare(
      `
        INSERT INTO sponsorship_requests (
          id, direction, sender_user_id, sender_role, receiver_user_id, receiver_role,
          sponsor_id, host_id, event_id, message, proposed_amount, status, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `
    ).run(
      requestId,
      direction,
      actorId,
      senderRole,
      receiverUserId!,
      receiverRole,
      sponsorId,
      hostId,
      eventId,
      message,
      proposedAmount,
      nextSponsorshipRequestExpiryIso()
    );

    createNotification(receiverUserId!, 'sponsorship_update', 'New sponsorship request', 'You have a new sponsorship request.', {
      requestId,
      eventId,
    });

    const created = db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(requestId);
    return res.status(201).json(created);
  });

  app.get('/api/sponsorship/requests', requireAuth, (req: AuthedRequest, res) => {
    const actorId = req.auth!.userId;
    const box = String(req.query.box || 'incoming');
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    if (status && !['pending', 'accepted', 'rejected', 'withdrawn', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    db.prepare(
      `
        UPDATE sponsorship_requests
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'pending' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')
      `
    ).run();

    const whereBase = box === 'outgoing' ? 'r.sender_user_id = ?' : 'r.receiver_user_id = ?';
    const where = status ? `${whereBase} AND r.status = ?` : whereBase;
    const params = status ? [actorId, status] : [actorId];

    const rows = db
      .prepare(
        `
          SELECT
            r.*,
            su.name as sender_name,
            ru.name as receiver_name,
            e.name as event_name,
            s.company_name as sponsor_company
          FROM sponsorship_requests r
          JOIN users su ON su.id = r.sender_user_id
          JOIN users ru ON ru.id = r.receiver_user_id
          LEFT JOIN events e ON e.id = r.event_id
          LEFT JOIN sponsors s ON s.id = r.sponsor_id
          WHERE ${where}
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params, limit, offset);

    return res.json(rows);
  });

  app.get('/api/sponsorship/requests/:id', requireAuth, (req: AuthedRequest, res) => {
    const request = db
      .prepare(
        `
          SELECT
            r.*,
            su.name as sender_name,
            ru.name as receiver_name,
            e.name as event_name,
            s.company_name as sponsor_company
          FROM sponsorship_requests r
          JOIN users su ON su.id = r.sender_user_id
          JOIN users ru ON ru.id = r.receiver_user_id
          LEFT JOIN events e ON e.id = r.event_id
          LEFT JOIN sponsors s ON s.id = r.sponsor_id
          WHERE r.id = ?
        `
      )
      .get(req.params.id) as any;

    if (!request) return res.status(404).json({ error: 'Request not found' });

    const actorId = req.auth!.userId;
    const isParticipant = req.auth!.role === 'admin' || request.sender_user_id === actorId || request.receiver_user_id === actorId;
    if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });

    return res.json(request);
  });

  app.post('/api/sponsorship/requests/:id/withdraw', requireAuth, (req: AuthedRequest, res) => {
    const request = db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(req.params.id) as any;
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(409).json({ error: 'Only pending requests can be withdrawn' });

    const actorId = req.auth!.userId;
    const canWithdraw = req.auth!.role === 'admin' || request.sender_user_id === actorId;
    if (!canWithdraw) return res.status(403).json({ error: 'Forbidden' });

    db.prepare(
      `
        UPDATE sponsorship_requests
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')
      `
    ).run(request.id);

    const afterExpiry = db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(request.id) as any;
    if (afterExpiry?.status === 'expired') {
      return res.status(409).json({ error: 'Request has expired' });
    }

    const updated = db.prepare(
      "UPDATE sponsorship_requests SET status = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
    ).run('withdrawn', actorId, request.id);
    if (updated.changes === 0) {
      return res.status(409).json({ error: 'Request already finalized' });
    }

    createNotification(request.receiver_user_id, 'sponsorship_update', 'Sponsorship request withdrawn', 'A sponsorship request was withdrawn.', {
      requestId: request.id,
    });

    return res.json(db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(request.id));
  });

  app.post('/api/sponsorship/requests/:id/respond', requireAuth, (req: AuthedRequest, res) => {
    const response = String(req.body?.status || '').trim();
    if (!['accepted', 'rejected'].includes(response)) {
      return res.status(400).json({ error: 'status must be accepted or rejected' });
    }

    const request = db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(req.params.id) as any;
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(409).json({ error: 'Request already finalized' });

    const actorId = req.auth!.userId;
    const isReceiver = request.receiver_user_id === actorId;
    const isAdmin = req.auth!.role === 'admin';
    if (!isReceiver && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    db.prepare(
      `
        UPDATE sponsorship_requests
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')
      `
    ).run(request.id);

    const requestAfterExpiry = db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(request.id) as any;
    if (requestAfterExpiry?.status === 'expired') {
      return res.status(409).json({ error: 'Request has expired' });
    }

    try {
      db.transaction(() => {
        const updateResult = db.prepare(
          "UPDATE sponsorship_requests SET status = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
        ).run(response, actorId, request.id);

        if (updateResult.changes === 0) {
          throw new Error('REQUEST_NOT_PENDING');
        }

        if (response === 'accepted') {
          try {
            db.prepare(
              `
                INSERT INTO deals (id, request_id, event_id, sponsor_id, host_id, admin_owner_id, agreed_amount, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
              `
            ).run(uuidv4(), request.id, request.event_id, request.sponsor_id, request.host_id, isAdmin ? actorId : null, request.proposed_amount || 0);
          } catch (error: any) {
            if (isSqliteConstraintError(error)) {
              throw new Error('DEAL_ALREADY_EXISTS');
            }
            throw error;
          }
        }
      })();
    } catch (error: any) {
      if (error?.message === 'REQUEST_NOT_PENDING') {
        return res.status(409).json({ error: 'Request already finalized' });
      }
      if (error?.message === 'DEAL_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'Deal already exists for this request' });
      }
      throw error;
    }

    if (request.event_id) invalidateEventAnalyticsCache(String(request.event_id));

    createNotification(request.sender_user_id, 'sponsorship_update', 'Sponsorship request updated', `Your request was ${response}.`, {
      requestId: request.id,
      status: response,
    });

    const updated = db.prepare('SELECT * FROM sponsorship_requests WHERE id = ?').get(request.id);
    return res.json(updated);
  });

  app.get('/api/sponsorship/deals', requireAuth, (req: AuthedRequest, res) => {
    const actorId = req.auth!.userId;
    const role = req.auth!.role;

    let rows: any[] = [];
    if (role === 'admin') {
      rows = db
        .prepare(
          `
            SELECT d.*, e.name as event_name, s.company_name as sponsor_company, hu.name as host_name
            FROM deals d
            JOIN events e ON e.id = d.event_id
            JOIN sponsors s ON s.id = d.sponsor_id
            JOIN users hu ON hu.id = d.host_id
            ORDER BY d.created_at DESC
          `
        )
        .all() as any[];
    } else if (role === 'host') {
      rows = db
        .prepare(
          `
            SELECT d.*, e.name as event_name, s.company_name as sponsor_company
            FROM deals d
            JOIN events e ON e.id = d.event_id
            JOIN sponsors s ON s.id = d.sponsor_id
            WHERE d.host_id = ?
            ORDER BY d.created_at DESC
          `
        )
        .all(actorId) as any[];
    } else if (role === 'sponsor') {
      const sponsor = db.prepare('SELECT id FROM sponsors WHERE user_id = ?').get(actorId) as any;
      if (!sponsor) return res.status(403).json({ error: 'Sponsor profile required' });
      rows = db
        .prepare(
          `
            SELECT d.*, e.name as event_name, hu.name as host_name
            FROM deals d
            JOIN events e ON e.id = d.event_id
            JOIN users hu ON hu.id = d.host_id
            WHERE d.sponsor_id = ?
            ORDER BY d.created_at DESC
          `
        )
        .all(sponsor.id) as any[];
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json(rows);
  });

  app.post('/api/sponsorship/deals/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const nextStatus = String(req.body?.status || '').trim();
    if (!['active', 'completed', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid deal status' });
    }

    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const actorId = req.auth!.userId;
    const role = req.auth!.role;
    const sponsor = role === 'sponsor' ? db.prepare('SELECT id FROM sponsors WHERE user_id = ?').get(actorId) as any : null;
    const isParticipant = role === 'admin' || deal.host_id === actorId || (sponsor && sponsor.id === deal.sponsor_id);
    if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });

    const allowedTransitions: Record<string, string[]> = {
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    const currentStatus = String(deal.status || '');
    if (nextStatus === currentStatus) {
      return res.json(deal);
    }
    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
      return res.status(409).json({ error: `Invalid transition: ${currentStatus} -> ${nextStatus}` });
    }

    db.prepare(
      'UPDATE deals SET status = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nextStatus, nextStatus === 'cancelled' ? String(req.body?.cancel_reason || '').trim() || null : null, deal.id);

    if (deal.event_id) invalidateEventAnalyticsCache(String(deal.event_id));

    return res.json(db.prepare('SELECT * FROM deals WHERE id = ?').get(deal.id));
  });

  app.get('/api/sponsorship/deals/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const actorId = req.auth!.userId;
    const role = req.auth!.role;
    const sponsor = role === 'sponsor' ? db.prepare('SELECT id FROM sponsors WHERE user_id = ?').get(actorId) as any : null;
    const isParticipant = role === 'admin' || deal.host_id === actorId || (sponsor && sponsor.id === deal.sponsor_id);
    if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });

    const messages = db
      .prepare(
        `
          SELECT dm.*, u.name as sender_name
          FROM deal_messages dm
          JOIN users u ON u.id = dm.sender_user_id
          WHERE dm.deal_id = ?
          ORDER BY dm.created_at ASC
        `
      )
      .all(deal.id);

    return res.json(messages);
  });

  app.post('/api/sponsorship/deals/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const actorId = req.auth!.userId;
    const role = req.auth!.role;
    const sponsor = role === 'sponsor' ? db.prepare('SELECT id FROM sponsors WHERE user_id = ?').get(actorId) as any : null;
    const isParticipant = role === 'admin' || deal.host_id === actorId || (sponsor && sponsor.id === deal.sponsor_id);
    if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });
    if (deal.status !== 'active') return res.status(409).json({ error: 'Messages are only allowed for active deals' });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required' });

    const id = uuidv4();
    db.prepare('INSERT INTO deal_messages (id, deal_id, sender_user_id, message) VALUES (?, ?, ?, ?)').run(
      id,
      deal.id,
      actorId,
      message
    );

    const request = db.prepare('SELECT sender_user_id, receiver_user_id FROM sponsorship_requests WHERE id = ?').get(deal.request_id) as any;
    const notifyTargets = [request?.sender_user_id, request?.receiver_user_id].filter((v) => v && v !== actorId);
    notifyTargets.forEach((target) => {
      createNotification(target, 'sponsorship_update', 'New deal message', 'You have a new message in an active sponsorship deal.', {
        dealId: deal.id,
      });
    });

    return res.json(db.prepare('SELECT dm.*, u.name as sender_name FROM deal_messages dm JOIN users u ON u.id = dm.sender_user_id WHERE dm.id = ?').get(id));
  });

  // Sponsorship
  app.post('/api/sponsors/profile', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.auth!.userId;
    const companyName = String(req.body?.company_name || '').trim();
    const website = req.body?.website ? String(req.body.website).trim() : null;
    const contactEmail = req.body?.contact_email ? String(req.body.contact_email).trim().toLowerCase() : null;

    if (!companyName) {
      return res.status(400).json({ error: 'company_name is required' });
    }

    const existing = db.prepare('SELECT id FROM sponsors WHERE user_id = ?').get(userId) as any;
    if (existing) {
      db.prepare('UPDATE sponsors SET company_name = ?, website = ?, contact_email = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(
        companyName,
        website,
        contactEmail,
        userId
      );
    } else {
      db.prepare(
        'INSERT INTO sponsors (id, user_id, company_name, website, contact_email, approved) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(uuidv4(), userId, companyName, website, contactEmail);
    }

    const profile = db.prepare('SELECT * FROM sponsors WHERE user_id = ?').get(userId);
    return res.json(profile);
  });

  app.get('/api/sponsors/profile', requireSponsorProfile, (req: AuthedRequest, res) => {
    const sponsor = db.prepare('SELECT * FROM sponsors WHERE user_id = ?').get(req.auth!.userId);
    return res.json(sponsor);
  });

  app.get('/api/sponsors/dashboard/events', requireSponsorProfile, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `
          SELECT e.id, e.name, e.date, e.venue, e.category_id, c.name as category_name, u.name as host_name
          FROM events e
          JOIN categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.host_id
          WHERE e.status = 'approved'
          ORDER BY e.date ASC
          LIMIT 100
        `
      )
      .all() as any[];

    const events = rows.map((row) => ({ ...row, analytics: getEventSponsorMetrics(row.id) }));
    return res.json(events);
  });

  app.all(/^\/api\/sponsorship\/proposals(?:\/.*)?$/, requireAuth, (req: AuthedRequest, res) => {
    return res.status(410).json({
      error: 'Legacy sponsorship proposals API is deprecated. Use /api/sponsorship/requests and /api/sponsorship/deals.',
    });
  });

  app.post('/api/sponsorship/proposals', requireSponsorProfile, (req: AuthedRequest, res) => {
    const sponsor = db.prepare('SELECT * FROM sponsors WHERE user_id = ?').get(req.auth!.userId) as any;
    const eventId = String(req.body?.event_id || '').trim();
    const title = String(req.body?.title || '').trim();
    const proposalAmount = parseNum(req.body?.proposal_amount, 0);
    const message = req.body?.message ? String(req.body.message).trim() : '';

    if (!eventId || !title) {
      return res.status(400).json({ error: 'event_id and title are required' });
    }

    const event = db.prepare('SELECT id, host_id, name, status FROM events WHERE id = ?').get(eventId) as any;
    if (!event || event.status !== 'approved') {
      return res.status(404).json({ error: 'Eligible event not found' });
    }

    const dealId = uuidv4();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO sponsorship_deals (id, event_id, host_id, sponsor_id, title, proposal_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(dealId, eventId, event.host_id, sponsor.id, title, proposalAmount, 'proposed');

      if (message) {
        db.prepare('INSERT INTO sponsorship_messages (id, deal_id, sender_user_id, message) VALUES (?, ?, ?, ?)').run(
          uuidv4(),
          dealId,
          req.auth!.userId,
          message
        );
      }
    })();

    createNotification(event.host_id, 'sponsorship_update', 'New sponsorship proposal', `A sponsor submitted a proposal for ${event.name}.`, {
      dealId,
      eventId,
    });

    const deal = db.prepare('SELECT * FROM sponsorship_deals WHERE id = ?').get(dealId);
    return res.json(deal);
  });

  app.get('/api/sponsorship/proposals', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.auth!.userId;
    const isAdmin = req.auth!.role === 'admin';
    const sponsor = db.prepare('SELECT id FROM sponsors WHERE user_id = ? AND approved = 1').get(userId) as any;

    let rows: any[] = [];
    if (isAdmin) {
      rows = db
        .prepare(
          `
            SELECT d.*, e.name as event_name, su.company_name as sponsor_company, hu.name as host_name
            FROM sponsorship_deals d
            JOIN events e ON e.id = d.event_id
            JOIN sponsors su ON su.id = d.sponsor_id
            JOIN users hu ON hu.id = d.host_id
            ORDER BY d.created_at DESC
          `
        )
        .all() as any[];
    } else if (sponsor) {
      rows = db
        .prepare(
          `
            SELECT d.*, e.name as event_name, hu.name as host_name
            FROM sponsorship_deals d
            JOIN events e ON e.id = d.event_id
            JOIN users hu ON hu.id = d.host_id
            WHERE d.sponsor_id = ?
            ORDER BY d.created_at DESC
          `
        )
        .all(sponsor.id) as any[];
    } else {
      rows = db
        .prepare(
          `
            SELECT d.*, e.name as event_name, su.company_name as sponsor_company
            FROM sponsorship_deals d
            JOIN events e ON e.id = d.event_id
            JOIN sponsors su ON su.id = d.sponsor_id
            WHERE d.host_id = ?
            ORDER BY d.created_at DESC
          `
        )
        .all(userId) as any[];
    }

    return res.json(rows);
  });

  app.get('/api/sponsorship/proposals/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const deal = db.prepare('SELECT * FROM sponsorship_deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const sponsor = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(deal.sponsor_id) as any;
    const isParticipant = req.auth!.role === 'admin' || deal.host_id === req.auth!.userId || sponsor?.user_id === req.auth!.userId;
    if (!isParticipant) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const messages = db
      .prepare(
        `
          SELECT m.*, u.name as sender_name
          FROM sponsorship_messages m
          JOIN users u ON u.id = m.sender_user_id
          WHERE m.deal_id = ?
          ORDER BY m.created_at ASC
        `
      )
      .all(req.params.id);

    return res.json(messages);
  });

  app.post('/api/sponsorship/proposals/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const deal = db.prepare('SELECT * FROM sponsorship_deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const sponsor = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(deal.sponsor_id) as any;
    const isParticipant = req.auth!.role === 'admin' || deal.host_id === req.auth!.userId || sponsor?.user_id === req.auth!.userId;
    if (!isParticipant) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO sponsorship_messages (id, deal_id, sender_user_id, message) VALUES (?, ?, ?, ?)').run(
      id,
      deal.id,
      req.auth!.userId,
      message
    );
    db.prepare("UPDATE sponsorship_deals SET status = 'negotiating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(deal.id);

    if (deal.host_id !== req.auth!.userId) {
      createNotification(deal.host_id, 'sponsorship_update', 'Sponsorship message', 'You have a new sponsorship negotiation message.', {
        dealId: deal.id,
      });
    }
    if (sponsor?.user_id && sponsor.user_id !== req.auth!.userId) {
      createNotification(sponsor.user_id, 'sponsorship_update', 'Sponsorship message', 'You have a new sponsorship negotiation message.', {
        dealId: deal.id,
      });
    }

    const created = db.prepare('SELECT * FROM sponsorship_messages WHERE id = ?').get(id);
    return res.json(created);
  });

  app.post('/api/events/:id/sponsor-spots', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const spotsInput = Array.isArray(req.body?.spots) ? req.body.spots : [req.body];
    if (!spotsInput.length) {
      return res.status(400).json({ error: 'spots are required' });
    }

    const createdIds: string[] = [];
    db.transaction(() => {
      const insert = db.prepare(
        'INSERT INTO sponsor_spots (id, event_id, label, spot_type, base_price, is_premium, status) VALUES (?, ?, ?, ?, ?, ?, ?)' 
      );

      spotsInput.forEach((spot: any) => {
        const label = String(spot?.label || '').trim();
        const spotType = String(spot?.spot_type || '').trim();
        const basePrice = parseNum(spot?.base_price, 0);
        if (!label || !['booth', 'banner', 'stall', 'premium'].includes(spotType)) {
          throw new Error('INVALID_SPOT');
        }
        const id = uuidv4();
        createdIds.push(id);
        insert.run(id, event.id, label, spotType, basePrice, spotType === 'premium' ? 1 : 0, 'open');
      });
    })();

    const rows = db
      .prepare('SELECT * FROM sponsor_spots WHERE id IN (' + createdIds.map(() => '?').join(', ') + ')')
      .all(...createdIds);
    return res.json(rows);
  });

  app.get('/api/events/:id/sponsor-spots', (req, res) => {
    const spots = db
      .prepare(
        `
          SELECT s.*, d.title as reserved_deal_title
          FROM sponsor_spots s
          LEFT JOIN sponsorship_deals d ON d.id = s.reserved_deal_id
          WHERE s.event_id = ?
          ORDER BY s.created_at ASC
        `
      )
      .all(req.params.id);
    return res.json(spots);
  });

  app.post('/api/sponsor-spots/:id/book', requireSponsorProfile, (req: AuthedRequest, res) => {
    const sponsor = db.prepare('SELECT * FROM sponsors WHERE user_id = ?').get(req.auth!.userId) as any;
    const spot = db.prepare('SELECT * FROM sponsor_spots WHERE id = ?').get(req.params.id) as any;
    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }
    if (spot.status !== 'open') {
      return res.status(409).json({ error: 'Spot is not available' });
    }
    if (spot.is_premium) {
      return res.status(400).json({ error: 'Use bidding endpoint for premium spots' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(spot.event_id) as any;
    const dealId = uuidv4();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO sponsorship_deals (id, event_id, host_id, sponsor_id, title, proposal_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(dealId, event.id, event.host_id, sponsor.id, `Spot booking: ${spot.label}`, spot.base_price, 'accepted');

      db.prepare('UPDATE sponsor_spots SET status = ?, reserved_deal_id = ? WHERE id = ?').run('booked', dealId, spot.id);
    })();

    createNotification(event.host_id, 'sponsorship_update', 'Sponsorship spot booked', `${sponsor.company_name} booked ${spot.label}.`, {
      eventId: event.id,
      spotId: spot.id,
      dealId,
    });

    return res.json({ success: true, deal_id: dealId, spot_id: spot.id });
  });

  app.post('/api/sponsor-spots/:id/bid', requireSponsorProfile, (req: AuthedRequest, res) => {
    const sponsor = db.prepare('SELECT * FROM sponsors WHERE user_id = ?').get(req.auth!.userId) as any;
    const amount = parseNum(req.body?.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid bid amount is required' });
    }

    try {
      const result = db.transaction(() => {
        const spot = db.prepare('SELECT * FROM sponsor_spots WHERE id = ?').get(req.params.id) as any;
        if (!spot) throw new Error('SPOT_NOT_FOUND');
        if (!spot.is_premium) throw new Error('NOT_PREMIUM');
        if (spot.status !== 'open') throw new Error('SPOT_CLOSED');

        const highest = db
          .prepare('SELECT * FROM bids WHERE spot_id = ? AND status = ? ORDER BY amount DESC, created_at ASC LIMIT 1')
          .get(spot.id, 'active') as any;

        if (highest && amount <= Number(highest.amount)) {
          throw new Error('BID_TOO_LOW');
        }

        db.prepare('UPDATE bids SET status = ? WHERE spot_id = ? AND sponsor_id = ? AND status = ?').run('outbid', spot.id, sponsor.id, 'active');
        const id = uuidv4();
        db.prepare('INSERT INTO bids (id, spot_id, sponsor_id, amount, status) VALUES (?, ?, ?, ?, ?)').run(id, spot.id, sponsor.id, amount, 'active');

        if (highest) {
          db.prepare('UPDATE bids SET status = ? WHERE id = ?').run('outbid', highest.id);
        }

        return db.prepare('SELECT * FROM bids WHERE id = ?').get(id);
      })();

      return res.json(result);
    } catch (error: any) {
      if (error?.message === 'SPOT_NOT_FOUND') return res.status(404).json({ error: 'Spot not found' });
      if (error?.message === 'NOT_PREMIUM') return res.status(400).json({ error: 'Only premium spots support bidding' });
      if (error?.message === 'SPOT_CLOSED') return res.status(409).json({ error: 'Spot is not open for bidding' });
      if (error?.message === 'BID_TOO_LOW') return res.status(409).json({ error: 'Bid must be higher than current top bid' });
      console.error(error);
      return res.status(500).json({ error: 'Failed to place bid' });
    }
  });

  app.get('/api/sponsor-spots/:id/bids', requireAuth, (req: AuthedRequest, res) => {
    const spot = db.prepare('SELECT * FROM sponsor_spots WHERE id = ?').get(req.params.id) as any;
    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    const event = db.prepare('SELECT host_id FROM events WHERE id = ?').get(spot.event_id) as any;
    const sponsor = db.prepare('SELECT id FROM sponsors WHERE user_id = ?').get(req.auth!.userId) as any;
    const isAllowed = req.auth!.role === 'admin' || event?.host_id === req.auth!.userId || Boolean(sponsor);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rows = db
      .prepare(
        `
          SELECT b.*, s.company_name
          FROM bids b
          JOIN sponsors s ON s.id = b.sponsor_id
          WHERE b.spot_id = ?
          ORDER BY b.amount DESC, b.created_at ASC
        `
      )
      .all(req.params.id);

    return res.json(rows);
  });

  app.get('/api/admin/sponsors', requireRole('admin'), (req, res) => {
    const rows = db
      .prepare(
        `
          SELECT s.*, u.name as user_name, u.email as user_email
          FROM sponsors s
          JOIN users u ON u.id = s.user_id
          ORDER BY s.created_at DESC
        `
      )
      .all();
    return res.json(rows);
  });

  app.post('/api/admin/sponsors/:id/approve', requireRole('admin'), (req, res) => {
    db.prepare('UPDATE sponsors SET approved = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    const sponsor = db.prepare('SELECT user_id FROM sponsors WHERE id = ?').get(req.params.id) as any;
    if (sponsor?.user_id) {
      createNotification(sponsor.user_id, 'sponsorship_update', 'Sponsor account approved', 'Your sponsor account is approved.', {
        sponsorId: req.params.id,
      });
    }
    return res.json({ success: true });
  });

  app.post('/api/admin/sponsors/:id/reject', requireRole('admin'), (req, res) => {
    db.prepare('UPDATE sponsors SET approved = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    const sponsor = db.prepare('SELECT user_id FROM sponsors WHERE id = ?').get(req.params.id) as any;
    if (sponsor?.user_id) {
      createNotification(sponsor.user_id, 'sponsorship_update', 'Sponsor account disabled', 'Your sponsor account access has been disabled.', {
        sponsorId: req.params.id,
      });
    }
    return res.json({ success: true });
  });

  app.get('/api/admin/sponsorship/deals', requireRole('admin'), (req, res) => {
    const rows = db
      .prepare(
        `
          SELECT d.*, e.name as event_name, s.company_name as sponsor_company, h.name as host_name
          FROM sponsorship_deals d
          JOIN events e ON e.id = d.event_id
          JOIN sponsors s ON s.id = d.sponsor_id
          JOIN users h ON h.id = d.host_id
          ORDER BY d.created_at DESC
        `
      )
      .all();
    return res.json(rows);
  });

  app.get('/api/admin/sponsorship/revenue', requireRole('admin'), (req, res) => {
    const revenue = db
      .prepare(
        `
          SELECT
            SUM(CASE WHEN d.status = 'accepted' THEN d.proposal_amount ELSE 0 END) as accepted_revenue,
            COUNT(CASE WHEN d.status = 'accepted' THEN 1 END) as accepted_deals,
            COUNT(*) as total_deals
          FROM sponsorship_deals d
        `
      )
      .get();
    return res.json(revenue);
  });

  app.post('/api/admin/bids/:id/override', requireRole('admin'), (req, res) => {
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(req.params.id) as any;
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    const spot = db.prepare('SELECT * FROM sponsor_spots WHERE id = ?').get(bid.spot_id) as any;
    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    db.transaction(() => {
      db.prepare("UPDATE bids SET status = 'overridden' WHERE spot_id = ? AND status IN ('active', 'outbid')").run(spot.id);
      db.prepare("UPDATE bids SET status = 'won' WHERE id = ?").run(bid.id);
      db.prepare("UPDATE sponsor_spots SET status = 'booked' WHERE id = ?").run(spot.id);
    })();

    const sponsor = db.prepare('SELECT user_id FROM sponsors WHERE id = ?').get(bid.sponsor_id) as any;
    if (sponsor?.user_id) {
      createNotification(sponsor.user_id, 'sponsorship_update', 'Bid override result', 'Your bid has been selected by an admin override.', {
        bidId: bid.id,
        spotId: spot.id,
      });
    }

    return res.json({ success: true });
  });

  // Admin Routes
  app.get('/api/admin/events/pending', requireRole('admin'), (req, res) => {
    const events = db
      .prepare(
        `
      SELECT e.*, c.name as category_name, u.name as host_name
      FROM events e
      JOIN categories c ON e.category_id = c.id
      JOIN users u ON e.host_id = u.id
      WHERE e.status = 'pending'
    `
      )
      .all();
    res.json(events);
  });

  app.post('/api/admin/events/:id/approve', requireRole('admin'), (req, res) => {
    db.prepare("UPDATE events SET status = 'approved' WHERE id = ?").run(req.params.id);
    const event = db.prepare('SELECT host_id, name FROM events WHERE id = ?').get(req.params.id) as any;
    if (event) createNotification(event.host_id, 'event_update', 'Event approved', `${event.name} has been approved.`, { eventId: req.params.id });
    res.json({ success: true });
  });

  app.post('/api/admin/events/:id/reject', requireRole('admin'), (req, res) => {
    db.prepare("UPDATE events SET status = 'rejected' WHERE id = ?").run(req.params.id);
    const event = db.prepare('SELECT host_id, name FROM events WHERE id = ?').get(req.params.id) as any;
    if (event) createNotification(event.host_id, 'event_update', 'Event rejected', `${event.name} has been rejected.`, { eventId: req.params.id });
    res.json({ success: true });
  });

  app.delete('/api/admin/events/:id', requireRole('admin'), (req, res) => {
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM ticket_types WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM bookings WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM reviews WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM discussions WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM faqs WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM reports WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM wishlists WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM events_fts WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
      })();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete event' });
    }
  });

  app.get('/api/admin/reports', requireRole('admin'), (req, res) => {
    const reports = db
      .prepare(
        `
      SELECT r.*, u.name as user_name, e.name as event_name
      FROM reports r
      JOIN users u ON r.user_id = u.id
      JOIN events e ON r.event_id = e.id
      WHERE r.status = 'pending'
    `
      )
      .all();
    res.json(reports);
  });

  app.post('/api/admin/reports/:id/approve', requireRole('admin'), (req, res) => {
    try {
      db.transaction(() => {
        const report = db.prepare('SELECT event_id FROM reports WHERE id = ?').get(req.params.id) as any;
        db.prepare("UPDATE reports SET status = 'approved' WHERE id = ?").run(req.params.id);
        db.prepare("UPDATE events SET status = 'rejected' WHERE id = ?").run(report.event_id);
      })();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to approve report' });
    }
  });

  app.post('/api/admin/reports/:id/dismiss', requireRole('admin'), (req, res) => {
    db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Host Event Status Update
  app.post('/api/host/events/:id/status', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const { status } = req.body;
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const actingUserId = req.auth!.userId;
    const actingRole = req.auth!.role;
    if (actingRole !== 'admin' && event.host_id !== actingUserId) {
      return res.status(403).json({ error: 'Unauthorized to update this event' });
    }

    if (!['completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status update' });
    }

    db.prepare('UPDATE events SET status = ? WHERE id = ?').run(status, req.params.id);

    const attendees = db.prepare('SELECT DISTINCT user_id FROM bookings WHERE event_id = ?').all(req.params.id) as Array<{ user_id: string }>;
    attendees.forEach((a) => {
      createNotification(a.user_id, 'event_update', 'Event status changed', `${event.name} is now ${status}.`, { eventId: req.params.id });
    });

    res.json({ success: true });
  });

  app.delete('/api/host/events/:id', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      db.transaction(() => {
        db.prepare('DELETE FROM ticket_types WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM bookings WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM reviews WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM discussions WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM faqs WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM reports WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM wishlists WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM events_fts WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
      })();
      return res.json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to delete event' });
    }
  });

  app.get('/api/events/:id/attendees', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const { checkedIn, verified } = req.query;
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) return res.status(403).json({ error: 'Unauthorized' });

    let query = `
      SELECT b.*, u.name as user_name, u.email as user_email, tt.name as ticket_type_name,
              t.ticket_id, t.status as ticket_status, t.verification_status as ticket_verification_status,
              t.verified_at as ticket_verified_at
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      JOIN ticket_types tt ON tt.id = b.ticket_type_id
      LEFT JOIN tickets t ON t.booking_id = b.id
      WHERE b.event_id = ?
    `;
    const params: any[] = [req.params.id];

    const normalizedFilter = typeof verified === 'string' ? verified : checkedIn;
    if (normalizedFilter === 'true' || normalizedFilter === 'verified') {
      query += " AND t.status = 'verified'";
    } else if (normalizedFilter === 'false' || normalizedFilter === 'pending') {
      query += " AND (t.status = 'pending' OR t.status IS NULL)";
    }
    query += ' ORDER BY b.created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    res.json(
      rows.map((row) => ({
        ...row,
        ticket_verification_status: toVerificationStatus(row.ticket_verification_status || row.ticket_status),
        ticket_status: toLegacyTicketStatus(row.ticket_verification_status || row.ticket_status),
      }))
    );
  });

  app.get('/api/tickets/user/:userId', requireSelfOrRole('userId', ['admin']), (req, res) => {
    const rows = db
      .prepare(
        `
          SELECT
            t.*, b.booking_ref, b.quantity, b.total_price,
            e.name as event_name, e.date as event_date, e.venue,
            tt.name as ticket_type_name
          FROM tickets t
          JOIN bookings b ON b.id = t.booking_id
          JOIN events e ON e.id = t.event_id
          JOIN ticket_types tt ON tt.id = b.ticket_type_id
          WHERE t.user_id = ?
          ORDER BY t.issued_at DESC
        `
      )
      .all(req.params.userId);

    return res.json(rows.map((row: any) => withTicketStatusFields(row)));
  });

  app.get('/api/events/:id/tickets/summary', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const stats = db
      .prepare(
        `
          SELECT
            COUNT(*) as total_registered,
            SUM(CASE WHEN (t.verification_status = 'VERIFIED_ATTENDANCE' OR t.status = 'verified') THEN 1 ELSE 0 END) as verified_attendees,
            SUM(CASE WHEN (t.verification_status = 'PENDING_VERIFICATION' OR t.status = 'pending') THEN 1 ELSE 0 END) as pending_attendees
          FROM tickets t
          WHERE t.event_id = ?
        `
      )
      .get(req.params.id) as any;

    return res.json({
      total_registered: Number(stats?.total_registered || 0),
      verified_attendees: Number(stats?.verified_attendees || 0),
      pending_attendees: Number(stats?.pending_attendees || 0),
    });
  });

  const handleVerifyTicketRequest: express.RequestHandler = (req: AuthedRequest, res) => {
    const eventId = req.body?.event_id ? String(req.body.event_id) : undefined;
    const source = req.body?.source === 'manual' ? 'manual' : 'scanner';
    let ticketId = req.body?.ticketId ? String(req.body.ticketId).trim() : '';
    let decodedEventId: string | undefined;

    const qrData = req.body?.qrData ? String(req.body.qrData) : '';
    const explicitToken = req.body?.token ? String(req.body.token) : '';

    if (qrData) {
      const parsed = parseTicketQrPayload(qrData);
      if (parsed.legacyBookingRef) {
        const legacy = getTicketByBookingRef(parsed.legacyBookingRef, eventId);
        ticketId = legacy?.ticket_id || '';
      }
      if (parsed.token) {
        try {
          const payload = jwt.verify(parsed.token, JWT_SECRET) as TicketTokenPayload;
          if (payload.typ !== 'event_ticket' || payload.v !== 1) {
            return res.status(400).json({ error: 'Invalid QR payload' });
          }
          ticketId = payload.ticketId;
          decodedEventId = payload.eventId;
        } catch {
          return res.status(400).json({ error: 'Invalid or tampered QR token' });
        }
      }
    }

    if (explicitToken) {
      try {
        const payload = jwt.verify(explicitToken, JWT_SECRET) as TicketTokenPayload;
        if (payload.typ !== 'event_ticket' || payload.v !== 1) {
          return res.status(400).json({ error: 'Invalid ticket token' });
        }
        ticketId = payload.ticketId;
        decodedEventId = payload.eventId;
      } catch {
        return res.status(400).json({ error: 'Invalid ticket token' });
      }
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'Invalid QR or ticket payload' });
    }

    if (eventId && decodedEventId && eventId !== decodedEventId) {
      return res.status(400).json({ error: 'Wrong event scan' });
    }

    const result = verifyTicketByTicketId(ticketId, req.auth!.userId, req.auth!.role, source, eventId || decodedEventId);
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }

    const ticket = withTicketStatusFields(result.ticket);
    return res.json({ success: true, alreadyCheckedIn: !!result.alreadyCheckedIn, ticket });
  };

  app.post('/api/tickets/verify', requireRole('host', 'admin'), ticketScanLimiter, handleVerifyTicketRequest);

  const verifyTicketAlias: express.RequestHandler = (req, _res, next) => {
    req.body = {
      ...req.body,
      qrData: req.body?.qrData || req.body?.qrToken || req.body?.token,
      event_id: req.body?.event_id || req.body?.eventId,
      ticketId: req.body?.ticketId,
      source: req.body?.source || 'scanner',
    };
    next();
  };

  app.post('/api/verify-ticket', requireRole('host', 'admin'), ticketScanLimiter, verifyTicketAlias, handleVerifyTicketRequest);
  app.post('/verify-ticket', requireRole('host', 'admin'), ticketScanLimiter, verifyTicketAlias, handleVerifyTicketRequest);

  app.post('/api/tickets/verify-manual', requireRole('host', 'admin'), ticketScanLimiter, (req: AuthedRequest, res) => {
    const eventId = String(req.body?.event_id || '').trim();
    const ticketId = String(req.body?.ticketId || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!eventId) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    let resolvedTicketId = ticketId;
    if (!resolvedTicketId && email) {
      const byEmail = db
        .prepare(
          `
            SELECT t.ticket_id
            FROM tickets t
            JOIN users u ON u.id = t.user_id
            WHERE t.event_id = ? AND lower(u.email) = ?
            ORDER BY CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END, t.issued_at DESC
            LIMIT 1
          `
        )
        .get(eventId, email) as any;
      resolvedTicketId = byEmail?.ticket_id || '';
    }

    if (!resolvedTicketId) {
      return res.status(400).json({ error: 'Provide ticketId or attendee email' });
    }

    const result = verifyTicketByTicketId(resolvedTicketId, req.auth!.userId, req.auth!.role, 'manual', eventId);
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }

    const ticket = withTicketStatusFields(result.ticket);
    return res.json({ success: true, alreadyCheckedIn: !!result.alreadyCheckedIn, ticket });
  });

  const handleTicketStatus: express.RequestHandler = (req: AuthedRequest, res) => {
    const ticketId = String(req.query.ticketId || '').trim();
    const token = String(req.query.token || '').trim();
    let resolvedTicketId = ticketId;

    if (!resolvedTicketId && token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as TicketTokenPayload;
        if (payload.typ !== 'event_ticket' || payload.v !== 1) {
          return res.status(400).json({ error: 'Invalid ticket token' });
        }
        resolvedTicketId = payload.ticketId;
      } catch {
        return res.status(400).json({ error: 'Invalid ticket token' });
      }
    }

    if (!resolvedTicketId) {
      return res.status(400).json({ error: 'ticketId or token is required' });
    }

    const ticket = withTicketStatusFields(getTicketByTicketId(resolvedTicketId));
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const requester = req.auth!;
    const isOwner = requester.userId === ticket.user_id;
    const isAdmin = requester.role === 'admin';
    const isHostOwner = requester.role === 'host' && requester.userId === ticket.host_id;
    if (!isOwner && !isAdmin && !isHostOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json({
      ticketId: ticket.ticket_id,
      eventId: ticket.event_id,
      userId: ticket.user_id,
      status: ticket.verification_status,
      legacyStatus: ticket.status,
      verifiedAt: ticket.verified_at || null,
      verifiedBy: ticket.verified_by || null,
      issuedAt: ticket.issued_at,
      expiresAt: ticket.expires_at || null,
    });
  };

  app.get('/api/ticket-status', requireAuth, handleTicketStatus);
  app.get('/ticket-status', requireAuth, handleTicketStatus);

  app.post('/api/bookings/check-in', requireRole('host', 'admin'), bookingLimiter, (req: AuthedRequest, res) => {
    const { bookingRef, event_id } = req.body;
    if (!bookingRef || !event_id) {
      return res.status(400).json({ error: 'Missing check-in fields' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Unauthorized check-in request' });
    }

    const ticket = getTicketByBookingRef(String(bookingRef), String(event_id));
    if (!ticket?.ticket_id) return res.status(404).json({ error: 'Booking not found for this event' });

    const result = verifyTicketByTicketId(ticket.ticket_id, req.auth!.userId, req.auth!.role, 'scanner', String(event_id));
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }

    return res.json({ success: true, alreadyCheckedIn: !!result.alreadyCheckedIn, ticket: result.ticket });
  });

  app.post('/api/bookings/:id/check-in', requireRole('host', 'admin'), bookingLimiter, (req: AuthedRequest, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Unauthorized check-in request' });
    }

    const ticket = db.prepare('SELECT ticket_id FROM tickets WHERE booking_id = ?').get(booking.id) as any;
    if (!ticket?.ticket_id) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const result = verifyTicketByTicketId(ticket.ticket_id, req.auth!.userId, req.auth!.role, 'manual', booking.event_id);
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }

    return res.json({ success: true, alreadyCheckedIn: !!result.alreadyCheckedIn, ticket: result.ticket });
  });

  app.post('/api/check-in', requireRole('host', 'admin'), bookingLimiter, (req: AuthedRequest, res) => {
    const { bookingRef, event_id } = req.body;
    if (!bookingRef || !event_id) {
      return res.status(400).json({ error: 'Missing check-in fields' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Unauthorized check-in request' });
    }

    const ticket = getTicketByBookingRef(String(bookingRef), String(event_id));
    if (!ticket?.ticket_id) {
      return res.status(404).json({ error: 'Booking not found for this event' });
    }

    const result = verifyTicketByTicketId(ticket.ticket_id, req.auth!.userId, req.auth!.role, 'scanner', String(event_id));
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.error, alreadyCheckedIn: result.alreadyCheckedIn });
    }

    return res.json({ success: true, alreadyCheckedIn: !!result.alreadyCheckedIn, ticket: result.ticket });
  });

  // Promo codes
  app.post('/api/promo-codes', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const eventId = req.body?.event_id ? String(req.body.event_id).trim() : null;
    const discountType = String(req.body?.discount_type || 'percent').trim();
    const discountValue = parseNum(req.body?.discount_value, NaN);
    const expiresAt = req.body?.expires_at ? String(req.body.expires_at) : null;
    const usageLimit = req.body?.usage_limit == null ? null : Math.max(1, parseInt(String(req.body.usage_limit), 10) || 1);

    if (!code || !['percent', 'fixed'].includes(discountType) || !Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ error: 'Invalid promo code payload' });
    }

    if (discountType === 'percent' && discountValue > 100) {
      return res.status(400).json({ error: 'Percent discount cannot exceed 100' });
    }

    if (eventId) {
      const event = db.prepare('SELECT id, host_id FROM events WHERE id = ?').get(eventId) as any;
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
        return res.status(403).json({ error: 'Forbidden for selected event' });
      }
    }

    const id = uuidv4();
    try {
      db.prepare(
        `
          INSERT INTO promo_codes (id, host_id, event_id, code, discount_type, discount_value, expires_at, usage_limit, usage_count, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
        `
      ).run(id, req.auth!.userId, eventId, code, discountType, discountValue, expiresAt, usageLimit);
      const created = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
      return res.json(created);
    } catch {
      return res.status(409).json({ error: 'Promo code already exists' });
    }
  });

  app.get('/api/promo-codes', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const rows = req.auth!.role === 'admin'
      ? db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all()
      : db.prepare('SELECT * FROM promo_codes WHERE host_id = ? ORDER BY created_at DESC').all(req.auth!.userId);
    return res.json(rows);
  });

  // Bookings
  app.post('/api/bookings', requireAuth, bookingLimiter, async (req: AuthedRequest, res) => {
    const { user_id, event_id, ticket_type_id, quantity, referral_code, promo_code } = req.body;
    const id = uuidv4();
    const booking_ref = `EVT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const bookingUserId = req.auth!.userId;
    if (user_id && user_id !== bookingUserId) {
      return res.status(403).json({ error: 'Booking user mismatch' });
    }

    const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(ticket_type_id) as any;
    if (!ticketType) return res.status(404).json({ error: 'Ticket type not found' });

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status !== 'approved') return res.status(400).json({ error: 'Event is not open for booking' });

    const qty = Number.parseInt(String(quantity), 10);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    const baseTotal = ticketType.price * qty;

    let discount = 0;
    let promoCodeUsed: string | null = null;
    let promoCodeRow: any = null;
    let referrerUser: any = null;

    if (promo_code) {
      const normalizedPromo = String(promo_code).trim().toUpperCase();
      promoCodeRow = db
        .prepare(
          `
            SELECT *
            FROM promo_codes
            WHERE code = ? AND is_active = 1
              AND (event_id IS NULL OR event_id = ?)
          `
        )
        .get(normalizedPromo, event_id) as any;

      if (!promoCodeRow) {
        return res.status(400).json({ error: 'Invalid promo code' });
      }

      if (promoCodeRow.expires_at && Date.parse(promoCodeRow.expires_at) < Date.now()) {
        return res.status(400).json({ error: 'Promo code has expired' });
      }

      if (promoCodeRow.usage_limit != null && Number(promoCodeRow.usage_count) >= Number(promoCodeRow.usage_limit)) {
        return res.status(400).json({ error: 'Promo code usage limit reached' });
      }

      if (promoCodeRow.discount_type === 'percent') {
        discount = Number(((baseTotal * Number(promoCodeRow.discount_value)) / 100).toFixed(2));
      } else {
        discount = Number(Number(promoCodeRow.discount_value).toFixed(2));
      }
      promoCodeUsed = promoCodeRow.code;
    }

    if (referral_code) {
      referrerUser = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(referral_code) as any;
      if (referrerUser && referrerUser.id !== bookingUserId && !promoCodeUsed) {
        discount = Number((baseTotal * 0.1).toFixed(2));
      }
    }

    const totalPrice = Math.max(0, baseTotal - discount);
    const ticketId = generateTicketId();
    const expiresAt = buildTicketExpiryIso(event.date);
    const ticketToken = buildTicketToken(
      {
        ticketId,
        eventId: event_id,
        userId: bookingUserId,
        bookingRef: booking_ref,
      },
      expiresAt
    );
    const qrCode = await QRCode.toDataURL(buildTicketQrPayload(ticketToken));

    try {
      db.transaction(() => {
        const ticketUpdate = db.prepare('UPDATE ticket_types SET sold = sold + ? WHERE id = ? AND sold + ? <= quantity').run(qty, ticket_type_id, qty);
        if (ticketUpdate.changes === 0) {
          throw new Error('INSUFFICIENT_TICKETS');
        }

        const eventUpdate = db.prepare("UPDATE events SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ? AND status = 'approved'").run(qty, event_id, qty);
        if (eventUpdate.changes === 0) {
          throw new Error('INSUFFICIENT_SEATS');
        }

        db.prepare(
          'INSERT INTO bookings (id, booking_ref, user_id, event_id, ticket_type_id, quantity, total_price, qr_code, referral_code_used, discount_amount, promo_code_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, booking_ref, bookingUserId, event_id, ticket_type_id, qty, totalPrice, qrCode, referral_code || null, discount, promoCodeUsed);

        db.prepare(
          `
            INSERT INTO tickets (id, ticket_id, booking_id, user_id, event_id, status, verification_status, issued_at, expires_at, qr_token)
            VALUES (?, ?, ?, ?, ?, 'pending', 'PENDING_VERIFICATION', CURRENT_TIMESTAMP, ?, ?)
          `
        ).run(uuidv4(), ticketId, id, bookingUserId, event_id, expiresAt, ticketToken);

        if (promoCodeRow) {
          db.prepare('UPDATE promo_codes SET usage_count = usage_count + 1 WHERE id = ?').run(promoCodeRow.id);
        }

        if (referrerUser && discount > 0) {
          db.prepare(
            'INSERT INTO referral_credits (id, referrer_id, referee_id, booking_id, credit_amount, status) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(uuidv4(), referrerUser.id, bookingUserId, id, discount, 'awarded');
        }
      })();
    } catch (error: any) {
      if (error?.message === 'INSUFFICIENT_TICKETS' || error?.message === 'INSUFFICIENT_SEATS') {
        return res.status(400).json({ error: 'Not enough seats available' });
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to create booking' });
    }

    const eventName = event.name;
    createNotification(
      bookingUserId,
      'booking',
      'Booking confirmed',
      `You booked tickets for ${eventName}.`,
      {
        bookingId: id,
        eventId: event_id,
      },
      `booking-confirmed-${id}`
    );

    if (event.host_id) {
      createNotification(event.host_id, 'booking', 'New booking', `A new booking was made for ${eventName}.`, { eventId: event_id, bookingId: id });
    }

    invalidateEventAnalyticsCache(event_id);

    res.json({ id, booking_ref, ticket_id: ticketId, qrCode, discount_amount: discount, total_price: totalPrice });
  });

  app.get('/api/bookings/user/:userId', requireSelfOrRole('userId', ['admin']), (req, res) => {
    const bookings = db
      .prepare(
        `
      SELECT b.*, e.name as event_name, e.date as event_date, e.venue, tt.name as ticket_type_name,
             t.ticket_id, t.status as ticket_status, t.issued_at as ticket_issued_at,
             t.verified_at as ticket_verified_at, t.expires_at as ticket_expires_at
      FROM bookings b
      JOIN events e ON b.event_id = e.id
      JOIN ticket_types tt ON b.ticket_type_id = tt.id
      LEFT JOIN tickets t ON t.booking_id = b.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `
      )
      .all(req.params.userId);
    res.json(bookings);
  });

  app.post('/api/bookings/:id/cancel', requireAuth, (req: AuthedRequest, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.status === 'cancelled') {
      return res.json({ success: true, alreadyCancelled: true });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const actorId = req.auth!.userId;
    const actorRole = req.auth!.role;
    const canCancel = actorRole === 'admin' || booking.user_id === actorId || event.host_id === actorId;
    if (!canCancel) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.transaction(() => {
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
      db.prepare('UPDATE ticket_types SET sold = MAX(sold - ?, 0) WHERE id = ?').run(booking.quantity, booking.ticket_type_id);
      db.prepare('UPDATE events SET available_seats = available_seats + ? WHERE id = ?').run(booking.quantity, booking.event_id);
    })();

    const promoted: any[] = [];
    for (let i = 0; i < Number(booking.quantity || 1); i += 1) {
      const next = promoteNextWaitlistForEvent(booking.event_id);
      if (!next) break;
      promoted.push(next);
    }

    invalidateEventAnalyticsCache(booking.event_id);

    createNotification(booking.user_id, 'booking', 'Booking cancelled', `Your booking for ${event.name} was cancelled.`, {
      bookingId: booking.id,
      eventId: event.id,
    });

    return res.json({ success: true, promoted_count: promoted.length });
  });

  // Waitlist
  app.post('/api/waitlist', requireAuth, (req: AuthedRequest, res) => {
    const eventId = String(req.body?.event_id || '').trim();
    if (!eventId) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as any;
    if (!event || event.status !== 'approved') {
      return res.status(404).json({ error: 'Eligible event not found' });
    }
    if (Number(event.available_seats) > 0) {
      return res.status(400).json({ error: 'Event still has available seats' });
    }

    const existing = db.prepare('SELECT * FROM waitlist WHERE event_id = ? AND user_id = ?').get(eventId, req.auth!.userId) as any;
    if (existing?.status === 'waiting') {
      const queue = db
        .prepare('SELECT id FROM waitlist WHERE event_id = ? AND status = ? ORDER BY created_at ASC, id ASC')
        .all(eventId, 'waiting') as Array<{ id: string }>;
      const position = Math.max(1, queue.findIndex((q) => q.id === existing.id) + 1);
      return res.json({ id: existing.id, event_id: eventId, status: 'waiting', position });
    }

    const id = existing?.id || uuidv4();
    if (existing) {
      db.prepare('UPDATE waitlist SET status = ?, promoted_at = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?').run('waiting', id);
    } else {
      db.prepare('INSERT INTO waitlist (id, event_id, user_id, status) VALUES (?, ?, ?, ?)').run(id, eventId, req.auth!.userId, 'waiting');
    }

    const queue = db
      .prepare('SELECT id FROM waitlist WHERE event_id = ? AND status = ? ORDER BY created_at ASC, id ASC')
      .all(eventId, 'waiting') as Array<{ id: string }>;
    const position = Math.max(1, queue.findIndex((q) => q.id === id) + 1);

    createNotification(req.auth!.userId, 'waitlist_update', 'Joined waitlist', `You joined the waitlist for ${event.name}.`, {
      eventId,
      waitlistId: id,
      position,
    });

    return res.json({ id, event_id: eventId, status: 'waiting', position });
  });

  app.post('/api/waitlist/promote', requireRole('host', 'admin'), (req: AuthedRequest, res) => {
    const eventId = String(req.body?.event_id || '').trim();
    const count = Math.max(1, Math.min(parseInt(String(req.body?.count ?? '1'), 10) || 1, 20));
    if (!eventId) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (req.auth!.role !== 'admin' && event.host_id !== req.auth!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const promoted: any[] = [];
    for (let i = 0; i < count; i += 1) {
      const next = promoteNextWaitlistForEvent(eventId);
      if (!next) break;
      promoted.push(next);
    }

    return res.json({ success: true, promoted_count: promoted.length, promoted });
  });

  // Calendar support
  app.get('/api/events-calendar', (req, res) => {
    const events = db
      .prepare(
        `
      SELECT e.id, e.name, e.date as start, e.date as end, e.venue, c.name as category_name
      FROM events e
      JOIN categories c ON c.id = e.category_id
      WHERE e.status = 'approved'
      ORDER BY e.date ASC
    `
      )
      .all();
    res.json(events);
  });

  // Categories
  app.get('/api/categories', (req, res) => {
    const categories = db
      .prepare(
        `
      SELECT c.*, COUNT(e.id) as event_count
      FROM categories c
      LEFT JOIN events e ON c.id = e.category_id AND e.status = 'approved'
      GROUP BY c.id
    `
      )
      .all();
    res.json(categories);
  });

  // Followers
  app.post('/api/users/:id/follow', (req, res) => {
    const { followerId } = req.body;
    const followingId = req.params.id;
    try {
      db.prepare('INSERT INTO followers (follower_id, following_id) VALUES (?, ?)').run(followerId, followingId);
      createNotification(followingId, 'follow', 'New follower', 'Someone started following you.', { followerId });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Already following or user not found' });
    }
  });

  app.delete('/api/users/:id/follow', (req, res) => {
    const { followerId } = req.body;
    const followingId = req.params.id;
    db.prepare('DELETE FROM followers WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
    res.json({ success: true });
  });

  app.get('/api/users/:id/followers', (req, res) => {
    const followers = db
      .prepare(
        `
      SELECT u.id, u.name, u.avatar, u.role
      FROM users u
      JOIN followers f ON u.id = f.follower_id
      WHERE f.following_id = ?
    `
      )
      .all(req.params.id);
    res.json(followers);
  });

  app.get('/api/users/:id/following', (req, res) => {
    const following = db
      .prepare(
        `
      SELECT u.id, u.name, u.avatar, u.role
      FROM users u
      JOIN followers f ON u.id = f.following_id
      WHERE f.follower_id = ?
    `
      )
      .all(req.params.id);
    res.json(following);
  });

  // Wishlist
  app.get('/api/wishlist/:userId', (req, res) => {
    const rows = db
      .prepare(
        `
        SELECT w.*, e.*, c.name as category_name, u.name as host_name
        FROM wishlists w
        JOIN events e ON e.id = w.event_id
        JOIN categories c ON c.id = e.category_id
        JOIN users u ON u.id = e.host_id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC
      `
      )
      .all(req.params.userId);
    res.json(rows);
  });

  app.post('/api/wishlist/:eventId', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    try {
      db.prepare('INSERT INTO wishlists (id, user_id, event_id) VALUES (?, ?, ?)').run(uuidv4(), userId, req.params.eventId);
      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  app.delete('/api/wishlist/:eventId', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    db.prepare('DELETE FROM wishlists WHERE user_id = ? AND event_id = ?').run(userId, req.params.eventId);
    res.json({ success: true });
  });

  // Sharing and referrals
  app.post('/api/events/:id/share', (req, res) => {
    db.prepare('UPDATE events SET share_count = share_count + 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/referrals/:userId', (req, res) => {
    const user = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(req.params.userId);
    const credits = db
      .prepare(
        'SELECT SUM(credit_amount) as total_credits, COUNT(*) as referral_count FROM referral_credits WHERE referrer_id = ?'
      )
      .get(req.params.userId);
    res.json({ referral_code: (user as any)?.referral_code, ...(credits as any) });
  });

  // Notifications
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.auth!.userId;
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(userId) as any[];
    const unread = rows.filter((n) => !n.is_read).length;
    res.json({ notifications: rows, unread_count: unread });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.auth!.userId;
    const target = db.prepare('SELECT id, user_id, is_read FROM notifications WHERE id = ?').get(req.params.id) as any;
    if (!target || target.user_id !== userId) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!target.is_read) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    }

    return res.json({ success: true, id: req.params.id, is_read: 1 });
  });

  // Backward-compatible notification routes
  app.get('/api/notifications/:userId', requireSelfOrRole('userId', ['admin']), (req, res) => {
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.userId);
    res.json(rows);
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    const target = db.prepare('SELECT id, user_id FROM notifications WHERE id = ?').get(req.params.id) as any;
    if (!target || (target.user_id !== req.auth!.userId && req.auth!.role !== 'admin')) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.auth!.userId);
    res.json({ success: true });
  });

  // Communities
  app.get('/api/communities', (req, res) => {
    const communities = db
      .prepare(
        `
      SELECT c.*, u.name as creator_name, (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      JOIN users u ON c.creator_id = u.id
    `
      )
      .all();
    res.json(communities);
  });

  app.post('/api/communities', (req, res) => {
    const { name, description, image, creatorId } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO communities (id, name, description, image, creator_id) VALUES (?, ?, ?, ?, ?)').run(
      id,
      name,
      description,
      image,
      creatorId
    );
    db.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)').run(id, creatorId, 'admin');
    res.json({ id, name });
  });

  app.get('/api/communities/:id', (req, res) => {
    const community = db
      .prepare(
        `
      SELECT c.*, u.name as creator_name, (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      JOIN users u ON c.creator_id = u.id
      WHERE c.id = ?
    `
      )
      .get(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    res.json(community);
  });

  app.post('/api/communities/:id/join', (req, res) => {
    const { userId } = req.body;
    const communityId = req.params.id;
    try {
      db.prepare('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)').run(communityId, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Already a member' });
    }
  });

  app.delete('/api/communities/:id/leave', (req, res) => {
    const { userId } = req.body;
    const communityId = req.params.id;
    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(communityId, userId);
    res.json({ success: true });
  });

  app.get('/api/communities/:id/posts', (req, res) => {
    const posts = db
      .prepare(
        `
      SELECT p.*, u.name as user_name, u.avatar as user_avatar
      FROM community_posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.community_id = ?
      ORDER BY p.created_at DESC
    `
      )
      .all(req.params.id);
    res.json(posts);
  });

  app.post('/api/communities/:id/posts', (req, res) => {
    const { userId, content, image } = req.body;
    const communityId = req.params.id;
    const id = uuidv4();
    db.prepare('INSERT INTO community_posts (id, community_id, user_id, content, image) VALUES (?, ?, ?, ?, ?)').run(
      id,
      communityId,
      userId,
      content,
      image
    );
    res.json({ id, content });
  });

  app.get('/api/communities/:id/members', (req, res) => {
    const members = db
      .prepare(
        `
      SELECT u.id, u.name, u.avatar, cm.role
      FROM users u
      JOIN community_members cm ON u.id = cm.user_id
      WHERE cm.community_id = ?
    `
      )
      .all(req.params.id);
    res.json(members);
  });

  app.get('/api/communities/:id/messages', (req, res) => {
    const messages = db
      .prepare(
        `
      SELECT m.*, u.name as user_name, u.avatar as user_avatar
      FROM community_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.community_id = ?
      ORDER BY m.created_at ASC
    `
      )
      .all(req.params.id);
    res.json(messages);
  });

  app.post('/api/communities/:id/messages', (req, res) => {
    const { userId, message } = req.body;
    const communityId = req.params.id;
    const id = uuidv4();
    db.prepare('INSERT INTO community_messages (id, community_id, user_id, message) VALUES (?, ?, ?, ?)').run(
      id,
      communityId,
      userId,
      message
    );

    const fullMessage = db
      .prepare(
        `
      SELECT m.*, u.name as user_name, u.avatar as user_avatar
      FROM community_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `
      )
      .get(id) as any;

    const members = db
      .prepare('SELECT user_id FROM community_members WHERE community_id = ? AND user_id != ?')
      .all(communityId, userId) as Array<{ user_id: string }>;
    members.forEach((m) => {
      createNotification(m.user_id, 'community_message', 'New community message', fullMessage.message, {
        communityId,
      });
    });

    const clients = communityClients.get(communityId);
    if (clients) {
      const payload = JSON.stringify({ type: 'new_message', data: fullMessage });
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      });
    }

    res.json(fullMessage);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    if (HOST === '0.0.0.0') {
      const lanAddresses = getLocalIpv4Addresses();
      lanAddresses.forEach((address) => {
        console.log(`LAN URL: http://${address}:${PORT}`);
      });

      if (lanAddresses.length === 0) {
        console.warn('No LAN IPv4 address detected. Run ipconfig to confirm your active network adapter.');
      }
    } else {
      console.log(`Bound host: ${HOST}`);
    }
  });
}

startServer();
