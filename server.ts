import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_DATABASE_STATE } from './src/data/seedData';
import {
  AppDatabaseState,
  AuditEvent,
  BookingRequest,
  ConditionReport,
  IncidentReport,
  PlatformPolicySettings,
  Resource,
  User,
  UserRole,
} from './src/types';
import { CAMPUS_TIMEZONE, getCampusTodayDate, toCampusTimestamp } from './src/lib/dateTime';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ENVIRONMENT & SUPABASE DETECTION ---
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const IS_PROD = process.env.NODE_ENV === 'production';
const ENABLE_DEMO_MODE = process.env.ENABLE_DEMO_MODE === 'true' || !IS_PROD;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co' &&
  !SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
  (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
);

// Production fail-safe check
if (IS_PROD && !isSupabaseConfigured && !ENABLE_DEMO_MODE) {
  console.error('FATAL: Supabase configuration (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) is missing in production environment. Refusing to boot without secure database.');
  process.exit(1);
}

// Server-side privileged client (Exclusive to backend, never exposed to client)
const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// Server-side JWT verifier using anon key
const supabaseAuthVerifier: SupabaseClient | null = isSupabaseConfigured && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (isSupabaseConfigured) {
  console.log('[ResourceBridge] Connected to Supabase PostgreSQL at:', SUPABASE_URL);
} else {
  console.log(`[ResourceBridge] Running with local demo dataset (ENABLE_DEMO_MODE=${ENABLE_DEMO_MODE}). Configure SUPABASE_URL in .env to use PostgreSQL.`);
}

// --- LOCAL STORE FALLBACK (FOR DEMO MODE) ---
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'resourcebridge-store.json');

function loadDatabase(): AppDatabaseState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AppDatabaseState;
      if (parsed && Array.isArray(parsed.resources) && Array.isArray(parsed.users)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Notice: Initializing seed state for local store.', err);
  }
  const initial = structuredClone(INITIAL_DATABASE_STATE);
  saveDatabase(initial);
  return initial;
}

function saveDatabase(state: AppDatabaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('Error persisting state:', err);
  }
}

let dbState: AppDatabaseState = loadDatabase();

// Demo session cache: token -> userId (Only valid when ENABLE_DEMO_MODE is true)
const activeSessions = new Map<string, { userId: string; issuedAt: number }>();

function parseHour(timeStr: string): number {
  const [hh] = timeStr.split(':').map(Number);
  return Number.isFinite(hh) ? hh : 0;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function intervalsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = parseHour(startA);
  const a1 = parseHour(endA);
  const b0 = parseHour(startB);
  const b1 = parseHour(endB);
  return a0 < b1 && b0 < a1;
}

function appendAudit(
  actor: User,
  actionType: AuditEvent['actionType'],
  targetType: AuditEvent['targetType'],
  targetId: string,
  summary: string
) {
  const event: AuditEvent = {
    id: `AUD-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`,
    timestamp: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actionType,
    targetType,
    targetId,
    summary,
  };
  dbState.auditEvents.unshift(event);

  // If Supabase is connected, record in PostgreSQL immutable audit table
  if (supabaseAdmin) {
    supabaseAdmin.from('audit_events').insert({
      id: event.id,
      timestamp: event.timestamp,
      actor_id: event.actorId,
      actor_name: event.actorName,
      actor_role: event.actorRole,
      action_type: event.actionType,
      target_type: event.targetType,
      target_id: event.targetId,
      summary: event.summary,
    }).then(({ error }) => {
      if (error) console.warn('[Supabase Audit Event notice]:', error.message);
    });
  }
}

interface AuthenticatedRequest extends Request {
  user?: User;
  token?: string;
}

// --- AUTHENTICATION MIDDLEWARE ---
async function authenticateUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice('Bearer '.length).trim();
  req.token = token;

  // 1. Supabase Auth JWT Verification (Cryptographic token validation)
  if (supabaseAuthVerifier) {
    try {
      const { data, error } = await supabaseAuthVerifier.auth.getUser(token);
      if (!error && data?.user) {
        // Query profile from database
        const { data: dbUser } = await supabaseAdmin!
          .from('users')
          .select('*')
          .or(`auth_user_id.eq.${data.user.id},email.eq.${data.user.email}`)
          .maybeSingle();

        if (dbUser) {
          req.user = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            department: dbUser.department,
            academicStanding: dbUser.academic_standing,
            role: dbUser.role as UserRole,
            completedSafetyModules: Array.isArray(dbUser.completed_safety_modules)
              ? dbUser.completed_safety_modules
              : [],
            activeRestrictions: dbUser.active_restrictions,
          };
          return next();
        }
      }
    } catch {
      // Token is not a Supabase JWT; fall through to demo session if permitted
    }
  }

  // 2. Demo Mode Session Lookup
  if (ENABLE_DEMO_MODE) {
    const session = activeSessions.get(token);
    if (session) {
      const found = dbState.users.find((u) => u.id === session.userId);
      if (found) {
        req.user = found;
        return next();
      }
    }
  }

  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required. Please sign in with an authorized campus account.',
    });
    return;
  }
  next();
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your current server-verified role is '${req.user.role}'.`,
      });
      return;
    }
    next();
  };
}

function sanitizeStateForViewer(state: AppDatabaseState, viewer?: User) {
  // Privacy rule: "Do not expose private information about other students."
  const isStaff = viewer?.role === 'manager' || viewer?.role === 'admin';
  const isAdmin = viewer?.role === 'admin';

  const sanitizedBookings = state.bookings.map((b) => {
    if (isStaff || (viewer && b.studentId === viewer.id)) {
      return b;
    }
    // Redact other students' personal names, supervisor, and purpose for public/student conflict visibility
    return {
      ...b,
      studentName: 'Reserved by Campus Student (Redacted)',
      studentDepartment: 'Redacted for Student Privacy',
      purpose: 'Authorized Academic / Lab Session',
      supervisorName: 'Redacted',
      courseOrProjectCode: 'Redacted',
    };
  });

  const sanitizedUsers = isAdmin
    ? state.users
    : isStaff
    ? state.users
    : state.users.filter((u) => (viewer && u.id === viewer.id) || u.role !== 'student');

  const sanitizedAudit = state.auditEvents.map((ev) => {
    if (isStaff || (viewer && ev.actorId === viewer.id) || ev.actorRole !== 'student') {
      return ev;
    }
    return {
      ...ev,
      actorName: 'Campus Student (Redacted)',
      summary: ev.summary.replace(ev.actorName, 'A student'),
    };
  });

  return {
    policy: state.policy,
    resources: state.resources,
    bookings: sanitizedBookings,
    incidents: state.incidents,
    auditEvents: sanitizedAudit,
    users: sanitizedUsers,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(authenticateUser);

  // --- HEALTH & STATUS ---
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      database: isSupabaseConfigured ? 'Supabase PostgreSQL' : 'Local Demo Store',
      demoModeEnabled: ENABLE_DEMO_MODE,
      environment: process.env.NODE_ENV || 'development',
      campusTimezone: `${CAMPUS_TIMEZONE} (IST, UTC+05:30)`,
      campusTodayDate: getCampusTodayDate(),
    });
  });

  // --- AUTH ENDPOINTS ---
  app.get('/api/auth/demo-accounts', (_req, res) => {
    if (!ENABLE_DEMO_MODE) {
      res.status(403).json({ error: 'Demo accounts are disabled in production mode.' });
      return;
    }
    const accounts = dbState.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
    }));
    res.json({ accounts });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!ENABLE_DEMO_MODE) {
      res.status(403).json({ error: 'Direct demo switching disabled in production. Please use Supabase Auth.' });
      return;
    }

    const { userId, email } = req.body as { userId?: string; email?: string };
    const user = dbState.users.find(
      (u) => (userId && u.id === userId) || (email && u.email.toLowerCase() === email.toLowerCase())
    );
    if (!user) {
      res.status(404).json({ error: 'Account not found in campus directory.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.set(token, { userId: user.id, issuedAt: Date.now() });
    res.json({
      token,
      user,
      state: sanitizeStateForViewer(dbState, user),
    });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.token) {
      activeSessions.delete(req.token);
    }
    res.json({ ok: true });
  });

  // --- STATE READ & RESET ---
  app.get('/api/state', (req: AuthenticatedRequest, res) => {
    const viewer = req.user;
    res.json({
      viewer: viewer ?? null,
      state: sanitizeStateForViewer(dbState, viewer),
    });
  });

  app.post('/api/demo/reset', requireRole(['admin']), (req: AuthenticatedRequest, res) => {
    if (!ENABLE_DEMO_MODE) {
      res.status(403).json({ error: 'Dataset reset is disabled in production.' });
      return;
    }
    dbState = structuredClone(INITIAL_DATABASE_STATE);
    saveDatabase(dbState);
    const viewer = req.user;
    res.json({
      message: 'Demonstration dataset reset to initial state.',
      state: sanitizeStateForViewer(dbState, viewer),
    });
  });

  // --- BOOKING WORKFLOW ---
  app.post('/api/bookings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    if (user.activeRestrictions) {
      res.status(403).json({
        error: `Account currently has an active access restriction: ${user.activeRestrictions}`,
      });
      return;
    }

    const {
      resourceId,
      date,
      startTime,
      durationHours,
      purpose,
      courseOrProjectCode,
      supervisorName,
      agreedToSafetyRules,
      selfDeclaredEligible,
    } = req.body as Partial<BookingRequest>;

    if (!resourceId || !date || !startTime || !durationHours || !purpose?.trim()) {
      res.status(400).json({ error: 'Resource, date, start time, duration, and intended purpose are required.' });
      return;
    }

    // Campus date validation (Asia/Kolkata IST)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid booking date format. Use YYYY-MM-DD.' });
      return;
    }
    const campusToday = getCampusTodayDate();
    if (date < campusToday) {
      res.status(400).json({
        error: `Cannot book dates in the past. Current campus date (IST) is ${campusToday}.`,
      });
      return;
    }

    if (!agreedToSafetyRules || !selfDeclaredEligible) {
      res.status(400).json({
        error: 'You must review and confirm both the eligibility requirements and mandatory laboratory safety rules.',
      });
      return;
    }

    const resource = dbState.resources.find((r) => r.id === resourceId);
    if (!resource) {
      res.status(404).json({ error: 'Selected resource does not exist.' });
      return;
    }

    if (resource.status === 'Maintenance' || resource.status === 'Restricted') {
      res.status(400).json({
        error: `${resource.name} is currently marked as ${resource.status} and cannot accept new bookings for immediate use.`,
      });
      return;
    }

    const dur = Number(durationHours);
    if (!Number.isFinite(dur) || dur < resource.minDurationHours || dur > resource.maxDurationHours) {
      res.status(400).json({
        error: `Booking duration for ${resource.code} must be between ${resource.minDurationHours} and ${resource.maxDurationHours} hours.`,
      });
      return;
    }

    const startHour = parseHour(startTime);
    const endHour = startHour + dur;
    if (endHour > 22 || startHour < 8) {
      res.status(400).json({
        error: 'Requested time window falls outside standard campus operating hours (08:00–22:00).',
      });
      return;
    }
    const endTime = formatHour(endHour);

    // Fair access check 1: Max active pending requests per student
    const studentPendingCount = dbState.bookings.filter(
      (b) => b.studentId === user.id && b.status === 'Pending'
    ).length;
    if (studentPendingCount >= dbState.policy.maxActivePendingRequestsPerStudent) {
      res.status(429).json({
        error: `Fair Access Policy: You already have ${studentPendingCount} pending requests (limit: ${dbState.policy.maxActivePendingRequestsPerStudent}). Please wait for manager review or cancel an existing request.`,
      });
      return;
    }

    // Fair access check 2: Weekly hours quota on this resource
    const studentResourceHours = dbState.bookings
      .filter(
        (b) =>
          b.studentId === user.id &&
          b.resourceId === resource.id &&
          (b.status === 'Approved' || b.status === 'CheckedIn' || b.status === 'Completed')
      )
      .reduce((acc, b) => acc + b.durationHours, 0);

    if (studentResourceHours + dur > resource.weeklyLimitHoursPerStudent) {
      res.status(429).json({
        error: `Fair Access Quota Exceeded: You have used/booked ${studentResourceHours}h on ${resource.code}. Requesting ${dur}h exceeds the ${resource.weeklyLimitHoursPerStudent}h weekly per-student cap.`,
      });
      return;
    }

    // Conflict check against already Approved / CheckedIn bookings
    const conflictingApproved = dbState.bookings.find(
      (b) =>
        b.resourceId === resource.id &&
        b.date === date &&
        (b.status === 'Approved' || b.status === 'CheckedIn') &&
        intervalsOverlap(startTime, endTime, b.startTime, b.endTime)
    );

    if (conflictingApproved) {
      res.status(409).json({
        error: `Time slot conflict detected: ${resource.code} already has an approved booking (${conflictingApproved.id}, ${conflictingApproved.startTime}–${conflictingApproved.endTime}) on ${date}. Please select another time slot.`,
      });
      return;
    }

    const newBooking: BookingRequest = {
      id: `BKG-2026-${Math.floor(804 + dbState.bookings.length)}`,
      resourceId: resource.id,
      resourceName: resource.name,
      resourceCode: resource.code,
      resourceLocation: resource.location,
      studentId: user.id,
      studentName: user.name,
      studentDepartment: user.department,
      date,
      startTime,
      durationHours: dur,
      endTime,
      purpose: purpose.trim(),
      courseOrProjectCode: (courseOrProjectCode || 'Independent Academic Project').trim(),
      supervisorName: (supervisorName || 'Department Faculty Advisor').trim(),
      agreedToSafetyRules: true,
      selfDeclaredEligible: true,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    dbState.bookings.unshift(newBooking);

    // If Supabase is connected, persist booking with absolute UTC timestamps computed from IST
    if (supabaseAdmin) {
      const startTimestamp = toCampusTimestamp(newBooking.date, newBooking.startTime);
      const endTimestamp = toCampusTimestamp(newBooking.date, newBooking.endTime);
      supabaseAdmin.from('bookings').insert({
        id: newBooking.id,
        resource_id: newBooking.resourceId,
        resource_name: newBooking.resourceName,
        resource_code: newBooking.resourceCode,
        resource_location: newBooking.resourceLocation,
        student_id: newBooking.studentId,
        student_name: newBooking.studentName,
        student_department: newBooking.studentDepartment,
        date: newBooking.date,
        start_time_text: newBooking.startTime,
        end_time_text: newBooking.endTime,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        duration_hours: newBooking.durationHours,
        purpose: newBooking.purpose,
        course_or_project_code: newBooking.courseOrProjectCode,
        supervisor_name: newBooking.supervisorName,
        agreed_to_safety_rules: newBooking.agreedToSafetyRules,
        self_declared_eligible: newBooking.selfDeclaredEligible,
        status: newBooking.status,
      }).then(({ error }) => {
        if (error) console.warn('[Supabase Booking Sync notice]:', error.message);
      });
    }

    appendAudit(
      user,
      'BOOKING_SUBMITTED',
      'Booking',
      newBooking.id,
      `Submitted booking request ${newBooking.id} for ${resource.code} on ${date} (${startTime}–${endTime} IST).`
    );
    saveDatabase(dbState);

    res.status(201).json({
      booking: newBooking,
      state: sanitizeStateForViewer(dbState, user),
    });
  });

  // --- MANAGER DECISION (APPROVE / REJECT / WAITLIST) ---
  app.post(
    '/api/bookings/:id/decision',
    requireRole(['manager', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const booking = dbState.bookings.find((b) => b.id === req.params.id);
      if (!booking) {
        res.status(404).json({ error: 'Booking request not found.' });
        return;
      }

      const { decision, note } = req.body as {
        decision: 'Approved' | 'Rejected' | 'Waitlisted';
        note?: string;
      };

      if (!['Approved', 'Rejected', 'Waitlisted'].includes(decision)) {
        res.status(400).json({ error: 'Invalid decision status.' });
        return;
      }

      // Valid state transition check
      if (booking.status !== 'Pending' && booking.status !== 'Waitlisted') {
        res.status(400).json({
          error: `Illegal state transition: Cannot change decision on a booking that is currently '${booking.status}'.`,
        });
        return;
      }

      // Conflict safeguard on the server
      if (decision === 'Approved') {
        const resource = dbState.resources.find((r) => r.id === booking.resourceId);
        if (resource && (resource.status === 'Maintenance' || resource.status === 'Restricted')) {
          res.status(409).json({
            error: `Cannot approve: Resource ${resource.code} is currently in ${resource.status} status.`,
          });
          return;
        }

        const conflictingApproved = dbState.bookings.find(
          (b) =>
            b.id !== booking.id &&
            b.resourceId === booking.resourceId &&
            b.date === booking.date &&
            (b.status === 'Approved' || b.status === 'CheckedIn') &&
            intervalsOverlap(booking.startTime, booking.endTime, b.startTime, b.endTime)
        );

        if (conflictingApproved) {
          res.status(409).json({
            error: `Conflict Safeguard: Cannot approve ${booking.id} (${booking.startTime}–${booking.endTime} on ${booking.date}) because ${conflictingApproved.id} (${conflictingApproved.studentName}) is already Approved for ${conflictingApproved.startTime}–${conflictingApproved.endTime}. You may Waitlist or Reject this request instead.`,
          });
          return;
        }
      }

      booking.status = decision;
      booking.managerDecisionNote =
        note?.trim() ||
        (decision === 'Approved'
          ? 'Approved after eligibility and schedule verification.'
          : decision === 'Waitlisted'
          ? 'Placed on waitlist pending slot availability.'
          : 'Request declined by resource custodian.');
      booking.decidedByName = actor.name;
      booking.decidedAt = new Date().toISOString();

      const actionMap = {
        Approved: 'BOOKING_APPROVED',
        Rejected: 'BOOKING_REJECTED',
        Waitlisted: 'BOOKING_WAITLISTED',
      } as const;

      appendAudit(
        actor,
        actionMap[decision],
        'Booking',
        booking.id,
        `${decision} booking ${booking.id} (${booking.studentName}) for ${booking.resourceCode} on ${booking.date} (${booking.startTime}–${booking.endTime}). Note: ${booking.managerDecisionNote}`
      );
      saveDatabase(dbState);

      res.json({
        booking,
        state: sanitizeStateForViewer(dbState, actor),
      });
    }
  );

  // --- CANCEL BOOKING ---
  app.post('/api/bookings/:id/cancel', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const booking = dbState.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    const isOwner = booking.studentId === actor.id;
    const isStaff = actor.role === 'manager' || actor.role === 'admin';
    if (!isOwner && !isStaff) {
      res.status(403).json({ error: 'You can only cancel your own booking requests.' });
      return;
    }

    if (!['Pending', 'Approved', 'Waitlisted'].includes(booking.status)) {
      res.status(400).json({
        error: `Cannot cancel a booking that is already in '${booking.status}' status.`,
      });
      return;
    }

    booking.status = 'Cancelled';
    appendAudit(
      actor,
      'BOOKING_CANCELLED',
      'Booking',
      booking.id,
      `Cancelled booking ${booking.id} for ${booking.resourceCode} (${booking.date} ${booking.startTime}–${booking.endTime}).`
    );
    saveDatabase(dbState);

    res.json({
      booking,
      state: sanitizeStateForViewer(dbState, actor),
    });
  });

  // --- CHECK-IN & BEFORE-USE CONDITION REPORT ---
  app.post('/api/bookings/:id/checkin', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const booking = dbState.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    if (booking.studentId !== actor.id && actor.role === 'student') {
      res.status(403).json({ error: 'Only the authorized student or a resource manager can check in.' });
      return;
    }

    if (booking.status !== 'Approved') {
      res.status(400).json({
        error: `Check-in denied: Booking must be in 'Approved' status (current status: '${booking.status}').`,
      });
      return;
    }

    const { rating, checklistVerified, accessoriesPresent, notes } = req.body as {
      rating?: ConditionReport['rating'];
      checklistVerified?: boolean;
      accessoriesPresent?: boolean;
      notes?: string;
    };

    if (!rating || !checklistVerified || !notes?.trim()) {
      res.status(400).json({
        error: 'Before-use condition rating, safety checklist verification, and inspection notes are mandatory to complete check-in.',
      });
      return;
    }

    const report: ConditionReport = {
      id: `CR-${Date.now().toString().slice(-5)}`,
      bookingId: booking.id,
      resourceId: booking.resourceId,
      submittedByUserId: actor.id,
      submittedByName: actor.name,
      phase: 'Before-Use',
      rating,
      checklistVerified: Boolean(checklistVerified),
      accessoriesPresent: Boolean(accessoriesPresent),
      notes: notes.trim(),
      timestamp: new Date().toISOString(),
    };

    booking.status = 'CheckedIn';
    booking.checkInAt = report.timestamp;
    booking.beforeConditionReport = report;

    const resource = dbState.resources.find((r) => r.id === booking.resourceId);
    if (resource && resource.status === 'Available') {
      resource.status = 'In Use';
      resource.conditionSummary = `${rating} — Checked in by ${actor.name}: ${notes.trim()}`;
    }

    appendAudit(
      actor,
      'CHECK_IN_COMPLETED',
      'Booking',
      booking.id,
      `Checked in to ${booking.resourceCode} (${booking.id}). Before-use condition: ${rating}.`
    );
    saveDatabase(dbState);

    res.json({
      booking,
      state: sanitizeStateForViewer(dbState, actor),
    });
  });

  // --- CHECK-OUT & AFTER-USE CONDITION REPORT ---
  app.post('/api/bookings/:id/checkout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const booking = dbState.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    if (booking.studentId !== actor.id && actor.role === 'student') {
      res.status(403).json({ error: 'Only the authorized student or a resource manager can check out.' });
      return;
    }

    if (booking.status !== 'CheckedIn') {
      res.status(400).json({
        error: `Check-out denied: Booking must be 'CheckedIn' first (current status: '${booking.status}').`,
      });
      return;
    }

    const { rating, checklistVerified, accessoriesPresent, notes } = req.body as {
      rating?: ConditionReport['rating'];
      checklistVerified?: boolean;
      accessoriesPresent?: boolean;
      notes?: string;
    };

    if (!rating || !checklistVerified || !notes?.trim()) {
      res.status(400).json({
        error: 'After-use condition rating, workspace reset verification, and return notes are mandatory to complete check-out.',
      });
      return;
    }

    const report: ConditionReport = {
      id: `CR-${Date.now().toString().slice(-5)}`,
      bookingId: booking.id,
      resourceId: booking.resourceId,
      submittedByUserId: actor.id,
      submittedByName: actor.name,
      phase: 'After-Use',
      rating,
      checklistVerified: Boolean(checklistVerified),
      accessoriesPresent: Boolean(accessoriesPresent),
      notes: notes.trim(),
      timestamp: new Date().toISOString(),
    };

    booking.status = 'Completed';
    booking.checkOutAt = report.timestamp;
    booking.afterConditionReport = report;
    booking.flaggedMissingReport = !booking.beforeConditionReport;

    const resource = dbState.resources.find((r) => r.id === booking.resourceId);
    if (resource) {
      resource.status = rating === 'Damaged — Unsafe / Faulty' ? 'Maintenance' : 'Available';
      resource.conditionSummary = `${rating} — Last returned ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${notes.trim()}`;
    }

    appendAudit(
      actor,
      'CHECK_OUT_COMPLETED',
      'Booking',
      booking.id,
      `Completed check-out for ${booking.resourceCode} (${booking.id}). After-use condition: ${rating}.`
    );
    saveDatabase(dbState);

    res.json({
      booking,
      state: sanitizeStateForViewer(dbState, actor),
    });
  });

  // --- INCIDENT REPORTING & REVIEW ---
  app.post('/api/incidents', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const { resourceId, bookingId, category, severity, description, supportingImageRef } = req.body as Partial<IncidentReport>;

    if (!resourceId || !category || !severity || !description?.trim()) {
      res.status(400).json({ error: 'Resource, incident category, severity, and detailed description are required.' });
      return;
    }

    const resource = dbState.resources.find((r) => r.id === resourceId);
    if (!resource) {
      res.status(404).json({ error: 'Related resource not found.' });
      return;
    }

    const now = new Date().toISOString();
    const incident: IncidentReport = {
      id: `INC-2026-${Math.floor(103 + dbState.incidents.length)}`,
      resourceId: resource.id,
      resourceName: resource.name,
      resourceCode: resource.code,
      bookingId: bookingId || undefined,
      reportedByUserId: actor.id,
      reportedByName: actor.name,
      reportedByRole: actor.role,
      category,
      severity,
      description: description.trim(),
      supportingImageRef: supportingImageRef?.trim() || undefined,
      status: 'Reported',
      humanReviewRequired: true,
      createdAt: now,
      updatedAt: now,
    };

    if (severity === 'Critical' || severity === 'High') {
      resource.status = 'Maintenance';
    }

    dbState.incidents.unshift(incident);
    appendAudit(
      actor,
      'INCIDENT_REPORTED',
      'Incident',
      incident.id,
      `Reported ${severity.toLowerCase()}-severity incident (${category}) on ${resource.code}. Human custodian review required.`
    );
    saveDatabase(dbState);

    res.status(201).json({
      incident,
      state: sanitizeStateForViewer(dbState, actor),
    });
  });

  app.patch(
    '/api/incidents/:id',
    requireRole(['manager', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const incident = dbState.incidents.find((i) => i.id === req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident record not found.' });
        return;
      }

      const { status, managerReviewNotes, updateResourceStatus } = req.body as {
        status?: IncidentReport['status'];
        managerReviewNotes?: string;
        updateResourceStatus?: Resource['status'];
      };

      if (status) incident.status = status;
      if (managerReviewNotes !== undefined) incident.managerReviewNotes = managerReviewNotes.trim();
      incident.reviewedByName = actor.name;
      incident.updatedAt = new Date().toISOString();

      if (updateResourceStatus) {
        const resource = dbState.resources.find((r) => r.id === incident.resourceId);
        if (resource) {
          resource.status = updateResourceStatus;
        }
      }

      appendAudit(
        actor,
        'INCIDENT_STATUS_UPDATED',
        'Incident',
        incident.id,
        `Updated incident ${incident.id} on ${incident.resourceCode} to '${incident.status}'. Review note: ${incident.managerReviewNotes || 'Recorded'}.`
      );
      saveDatabase(dbState);

      res.json({
        incident,
        state: sanitizeStateForViewer(dbState, actor),
      });
    }
  );

  // --- RESOURCE CREATION & MANAGEMENT (MANAGER / ADMIN) ---
  app.post(
    '/api/resources',
    requireRole(['manager', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const body = req.body as Partial<Resource>;
      if (!body.name?.trim() || !body.code?.trim() || !body.category || !body.location?.trim()) {
        res.status(400).json({ error: 'Resource name, code, category, and location are required.' });
        return;
      }

      const newResource: Resource = {
        id: `res-${Date.now().toString().slice(-6)}`,
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        category: body.category,
        resourceType: body.resourceType || 'Equipment',
        location: body.location.trim(),
        building: body.building?.trim() || body.location.split('·')[0].trim(),
        description: body.description?.trim() || 'Institutional shared educational technical resource.',
        imageUrl: body.imageUrl || '/src/assets/images/electronics_oscilloscope_bench_1793208046779.jpg',
        status: body.status || 'Available',
        conditionSummary: body.conditionSummary?.trim() || 'Excellent — Clean & ready for educational use.',
        operatingHours: body.operatingHours?.trim() || '08:00 – 18:00 (Mon–Fri)',
        availableTimeSlots: body.availableTimeSlots?.length
          ? body.availableTimeSlots
          : ['08:00', '10:00', '12:00', '14:00', '16:00'],
        minDurationHours: Number(body.minDurationHours) || 1,
        maxDurationHours: Number(body.maxDurationHours) || 4,
        weeklyLimitHoursPerStudent: Number(body.weeklyLimitHoursPerStudent) || 6,
        cooldownHours: Number(body.cooldownHours) || 6,
        eligibilityRequirements: body.eligibilityRequirements?.length
          ? body.eligibilityRequirements
          : ['Enrolled senior student in good standing', 'Completed basic laboratory safety orientation'],
        requiredSafetyModule: body.requiredSafetyModule || 'Lab Safety & Basic Electrical Orientation',
        safetyRules: body.safetyRules?.length
          ? body.safetyRules
          : [
              'Check condition before and after use.',
              'Report missing cables or damage immediately.',
            ],
        managerId: actor.id,
        managerName: actor.name,
        isDemoListing: true,
        specifications: body.specifications || {
          'Added By': actor.name,
          'Educational Status': 'Active',
        },
      };

      dbState.resources.unshift(newResource);
      appendAudit(
        actor,
        'RESOURCE_CREATED',
        'Resource',
        newResource.id,
        `Added new resource listing ${newResource.code} (${newResource.name}) in ${newResource.location}.`
      );
      saveDatabase(dbState);

      res.status(201).json({
        resource: newResource,
        state: sanitizeStateForViewer(dbState, actor),
      });
    }
  );

  app.patch(
    '/api/resources/:id',
    requireRole(['manager', 'admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const resource = dbState.resources.find((r) => r.id === req.params.id);
      if (!resource) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }

      const updates = req.body as Partial<Resource>;
      if (updates.name !== undefined) resource.name = updates.name.trim();
      if (updates.status !== undefined) resource.status = updates.status;
      if (updates.conditionSummary !== undefined) resource.conditionSummary = updates.conditionSummary.trim();
      if (updates.operatingHours !== undefined) resource.operatingHours = updates.operatingHours.trim();
      if (updates.maxDurationHours !== undefined) resource.maxDurationHours = Number(updates.maxDurationHours);
      if (updates.weeklyLimitHoursPerStudent !== undefined) {
        resource.weeklyLimitHoursPerStudent = Number(updates.weeklyLimitHoursPerStudent);
      }
      if (updates.location !== undefined) resource.location = updates.location.trim();

      appendAudit(
        actor,
        'RESOURCE_UPDATED',
        'Resource',
        resource.id,
        `Updated resource ${resource.code}: status='${resource.status}', maxDuration=${resource.maxDurationHours}h, weeklyCap=${resource.weeklyLimitHoursPerStudent}h.`
      );
      saveDatabase(dbState);

      res.json({
        resource,
        state: sanitizeStateForViewer(dbState, actor),
      });
    }
  );

  // --- ADMIN ENDPOINTS (USER ROLES & PLATFORM POLICY) ---
  app.patch('/api/users/:id/role', requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    // Strict defense: Ensure caller is genuinely admin
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Access denied: Only administrators can modify roles or restrictions.' });
      return;
    }

    const targetUser = dbState.users.find((u) => u.id === req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { role, activeRestrictions } = req.body as {
      role?: UserRole;
      activeRestrictions?: string | null;
    };

    if (role && ['student', 'manager', 'admin'].includes(role)) {
      targetUser.role = role;
    }
    if (activeRestrictions !== undefined) {
      targetUser.activeRestrictions = activeRestrictions;
    }

    appendAudit(
      actor,
      'ROLE_UPDATED',
      'User',
      targetUser.id,
      `Administrator updated ${targetUser.name}: role='${targetUser.role}', restrictions='${targetUser.activeRestrictions || 'None'}'.`
    );
    saveDatabase(dbState);

    res.json({
      user: targetUser,
      state: sanitizeStateForViewer(dbState, actor),
    });
  });

  app.patch('/api/policy', requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const updates = req.body as Partial<PlatformPolicySettings>;

    if (updates.maxActivePendingRequestsPerStudent !== undefined) {
      dbState.policy.maxActivePendingRequestsPerStudent = Number(updates.maxActivePendingRequestsPerStudent);
    }
    if (updates.defaultWeeklyHoursCapPerStudent !== undefined) {
      dbState.policy.defaultWeeklyHoursCapPerStudent = Number(updates.defaultWeeklyHoursCapPerStudent);
    }
    if (updates.defaultCooldownHoursBetweenBookings !== undefined) {
      dbState.policy.defaultCooldownHoursBetweenBookings = Number(updates.defaultCooldownHoursBetweenBookings);
    }
    if (updates.requireBeforeAndAfterConditionReports !== undefined) {
      dbState.policy.requireBeforeAndAfterConditionReports = Boolean(updates.requireBeforeAndAfterConditionReports);
    }

    appendAudit(
      actor,
      'POLICY_UPDATED',
      'Policy',
      'GLOBAL-POLICY',
      `Updated fair-access policy: maxPending=${dbState.policy.maxActivePendingRequestsPerStudent}, weeklyCap=${dbState.policy.defaultWeeklyHoursCapPerStudent}h, cooldown=${dbState.policy.defaultCooldownHoursBetweenBookings}h.`
    );
    saveDatabase(dbState);

    res.json({
      policy: dbState.policy,
      state: sanitizeStateForViewer(dbState, actor),
    });
  });

  // --- VITE MIDDLEWARE OR STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ResourceBridge server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
