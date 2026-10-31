import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { INITIAL_DATABASE_STATE } from './src/data/seedData';
import {
  AppDatabaseState,
  AuditEvent,
  BookingRequest,
  ConditionReport,
  IncidentReport,
  OrganizationInvitation,
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

// --- GEMINI AI ASSISTANT INITIALIZATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const aiClient = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

if (aiClient) {
  console.log('[ResourceBridge] Gemini AI Incident Assistant initialized with server-side API key.');
} else {
  console.warn('[ResourceBridge] GEMINI_API_KEY not found in environment. AI Incident Assistant endpoint will return 503.');
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

function mapUserFromDb(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    academicStanding: row.academic_standing || row.academicStanding || 'Student in Good Standing',
    role: row.role as UserRole,
    completedSafetyModules: Array.isArray(row.completed_safety_modules)
      ? row.completed_safety_modules
      : Array.isArray(row.completedSafetyModules)
      ? row.completedSafetyModules
      : [],
    activeRestrictions: row.active_restrictions ?? row.activeRestrictions ?? null,
    organizationId: row.organization_id || row.organizationId || 'org-greenwood-1',
    organizationName: row.organization_name || row.organizationName || 'Greenwood College & Senior School',
    status: (row.status as any) || 'active',
    emailVerified: row.email_verified !== undefined ? Boolean(row.email_verified) : true,
  };
}

function mapResourceFromDb(row: any): Resource {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    resourceType: row.resource_type || row.resourceType || 'Equipment',
    location: row.location,
    building: row.building || '',
    description: row.description || '',
    imageUrl: row.image_url || row.imageUrl || '',
    status: row.status,
    conditionSummary: row.condition_summary || row.conditionSummary || '',
    operatingHours: row.operating_hours || row.operatingHours || '08:00 – 18:00 (Mon–Fri)',
    availableTimeSlots: Array.isArray(row.available_time_slots)
      ? row.available_time_slots
      : Array.isArray(row.availableTimeSlots)
      ? row.availableTimeSlots
      : ['08:00', '10:00', '12:00', '14:00', '16:00'],
    minDurationHours: Number(row.min_duration_hours ?? row.minDurationHours ?? 1),
    maxDurationHours: Number(row.max_duration_hours ?? row.maxDurationHours ?? 4),
    weeklyLimitHoursPerStudent: Number(row.weekly_limit_hours_per_student ?? row.weeklyLimitHoursPerStudent ?? 8),
    cooldownHours: Number(row.cooldown_hours ?? row.cooldownHours ?? 6),
    eligibilityRequirements: Array.isArray(row.eligibility_requirements)
      ? row.eligibility_requirements
      : Array.isArray(row.eligibilityRequirements)
      ? row.eligibilityRequirements
      : [],
    requiredSafetyModule: row.required_safety_module || row.requiredSafetyModule || 'Lab Safety & Basic Electrical Orientation',
    safetyRules: Array.isArray(row.safety_rules)
      ? row.safety_rules
      : Array.isArray(row.safetyRules)
      ? row.safetyRules
      : [],
    managerId: row.manager_id || row.managerId || '',
    managerName: row.manager_name || row.managerName || '',
    isDemoListing: Boolean(row.is_demo_listing ?? row.isDemoListing ?? false),
    specifications: typeof row.specifications === 'object' && row.specifications !== null ? row.specifications : {},
    organizationId: row.organization_id || row.organizationId || 'org-greenwood-1',
  };
}

function mapBookingFromDb(row: any): BookingRequest {
  return {
    id: row.id,
    resourceId: row.resource_id || row.resourceId,
    resourceName: row.resource_name || row.resourceName,
    resourceCode: row.resource_code || row.resourceCode,
    resourceLocation: row.resource_location || row.resourceLocation,
    studentId: row.student_id || row.studentId,
    studentName: row.student_name || row.studentName,
    studentDepartment: row.student_department || row.studentDepartment,
    date: row.date,
    startTime: row.start_time_text || row.startTime,
    endTime: row.end_time_text || row.endTime,
    durationHours: Number(row.duration_hours ?? row.durationHours ?? 1),
    purpose: row.purpose,
    courseOrProjectCode: row.course_or_project_code || row.courseOrProjectCode || '',
    supervisorName: row.supervisor_name || row.supervisorName || '',
    agreedToSafetyRules: Boolean(row.agreed_to_safety_rules ?? row.agreedToSafetyRules ?? true),
    selfDeclaredEligible: Boolean(row.self_declared_eligible ?? row.selfDeclaredEligible ?? true),
    status: row.status,
    managerDecisionNote: row.manager_decision_note || row.managerDecisionNote,
    decidedByName: row.decided_by_name || row.decidedByName,
    decidedAt: row.decided_at || row.decidedAt,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    checkInAt: row.check_in_at || row.checkInAt,
    checkOutAt: row.check_out_at || row.checkOutAt,
    beforeConditionReport: row.before_condition_report || row.beforeConditionReport,
    afterConditionReport: row.after_condition_report || row.afterConditionReport,
    flaggedMissingReport: Boolean(row.flagged_missing_report ?? row.flaggedMissingReport ?? false),
    organizationId: row.organization_id || row.organizationId || 'org-greenwood-1',
  };
}

function mapIncidentFromDb(row: any): IncidentReport {
  return {
    id: row.id,
    resourceId: row.resource_id || row.resourceId,
    resourceName: row.resource_name || row.resourceName,
    resourceCode: row.resource_code || row.resourceCode,
    bookingId: row.booking_id || row.bookingId || undefined,
    reportedByUserId: row.reported_by_user_id || row.reportedByUserId,
    reportedByName: row.reported_by_name || row.reportedByName,
    reportedByRole: row.reported_by_role || row.reportedByRole,
    category: row.category,
    severity: row.severity,
    description: row.description,
    supportingImageRef: row.supporting_image_ref || row.supportingImageRef || undefined,
    status: row.status,
    managerReviewNotes: row.manager_review_notes || row.managerReviewNotes,
    reviewedByName: row.reviewed_by_name || row.reviewedByName,
    humanReviewRequired: Boolean(row.human_review_required ?? row.humanReviewRequired ?? true),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    organizationId: row.organization_id || row.organizationId || 'org-greenwood-1',
  };
}

function mapAuditEventFromDb(row: any): AuditEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    actorId: row.actor_id || row.actorId,
    actorName: row.actor_name || row.actorName,
    actorRole: row.actor_role || row.actorRole,
    actionType: row.action_type || row.actionType,
    targetType: row.target_type || row.targetType,
    targetId: row.target_id || row.targetId,
    summary: row.summary,
    metadata: row.metadata,
    organizationId: row.organization_id || row.organizationId || 'org-greenwood-1',
  };
}

function mapPolicyFromDb(row: any): PlatformPolicySettings {
  return {
    maxActivePendingRequestsPerStudent: Number(
      row.max_active_pending_requests_per_student ?? row.maxActivePendingRequestsPerStudent ?? 4
    ),
    defaultWeeklyHoursCapPerStudent: Number(
      row.default_weekly_hours_cap_per_student ?? row.defaultWeeklyHoursCapPerStudent ?? 8
    ),
    defaultCooldownHoursBetweenBookings: Number(
      row.default_cooldown_hours_between_bookings ?? row.defaultCooldownHoursBetweenBookings ?? 6
    ),
    requireBeforeAndAfterConditionReports: Boolean(
      row.require_before_and_after_condition_reports ?? row.requireBeforeAndAfterConditionReports ?? true
    ),
    enforceHumanReviewForAllIncidents: Boolean(
      row.enforce_human_review_for_all_incidents ?? row.enforceHumanReviewForAllIncidents ?? true
    ),
    allowWaitlistOnConflict: Boolean(
      row.allow_waitlist_on_conflict ?? row.allowWaitlistOnConflict ?? true
    ),
    institutionName: row.institution_name || row.institutionName || 'Greenwood College & Senior School',
    environmentMode: 'Single-Instance Server & Demo Dataset',
  };
}

let hasOrganizationSupport = false;

async function checkOrganizationSupport(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin.from('organizations').select('id').limit(1);
    hasOrganizationSupport = !error;
  } catch {
    hasOrganizationSupport = false;
  }
  return hasOrganizationSupport;
}

async function loadStateFromSupabase(): Promise<AppDatabaseState> {
  if (!supabaseAdmin) {
    throw new Error('Supabase client is not available on server.');
  }

  await checkOrganizationSupport();

  const [
    resourcesRes,
    bookingsRes,
    incidentsRes,
    auditRes,
    usersRes,
    policyRes,
  ] = await Promise.all([
    supabaseAdmin.from('resources').select('*'),
    supabaseAdmin.from('bookings').select('*').order('date', { ascending: true }),
    supabaseAdmin.from('incidents').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('audit_events').select('*').order('timestamp', { ascending: false }).limit(200),
    supabaseAdmin.from('users').select('*'),
    supabaseAdmin.from('platform_policy').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (resourcesRes.error) {
    throw new Error(`Failed to load resources from Supabase: ${resourcesRes.error.message}`);
  }
  if (bookingsRes.error) {
    throw new Error(`Failed to load bookings from Supabase: ${bookingsRes.error.message}`);
  }
  if (incidentsRes.error) {
    throw new Error(`Failed to load incidents from Supabase: ${incidentsRes.error.message}`);
  }
  if (auditRes.error) {
    throw new Error(`Failed to load audit events from Supabase: ${auditRes.error.message}`);
  }
  if (usersRes.error) {
    throw new Error(`Failed to load users from Supabase: ${usersRes.error.message}`);
  }

  let organizations: any[] = [];
  let invitations: any[] = [];
  if (hasOrganizationSupport) {
    try {
      const { data: orgData } = await supabaseAdmin.from('organizations').select('*');
      if (orgData && orgData.length > 0) organizations = orgData;
    } catch {}
    try {
      const { data: invData } = await supabaseAdmin.from('organization_invitations').select('*');
      if (invData && invData.length > 0) invitations = invData;
    } catch {}
  }

  if (organizations.length === 0) {
    organizations = [
      {
        id: 'org-greenwood-1',
        name: 'Greenwood College & Senior School',
        slug: 'greenwood-college',
        description: 'Unified campus sharing facility for STEM, robotics, and computing',
      },
    ];
  }

  const policy = policyRes.data
    ? mapPolicyFromDb(policyRes.data)
    : INITIAL_DATABASE_STATE.policy;

  return {
    policy,
    resources: (resourcesRes.data || []).map(mapResourceFromDb),
    bookings: (bookingsRes.data || []).map(mapBookingFromDb),
    incidents: (incidentsRes.data || []).map(mapIncidentFromDb),
    auditEvents: (auditRes.data || []).map(mapAuditEventFromDb),
    users: (usersRes.data || []).map(mapUserFromDb),
    organizations,
    invitations: invitations.map((inv) => ({
      id: inv.id,
      organizationId: inv.organization_id,
      email: inv.email,
      role: inv.role,
      name: inv.name,
      department: inv.department,
      invitedByUserId: inv.invited_by_user_id,
      expiresAt: inv.expires_at,
      status: inv.status,
      createdAt: inv.created_at,
    })),
  };
}

async function appendAudit(
  actor: User,
  actionType: AuditEvent['actionType'],
  targetType: AuditEvent['targetType'],
  targetId: string,
  summary: string
): Promise<AuditEvent> {
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
    organizationId: actor.organizationId || 'org-greenwood-1',
  };

  if (isSupabaseConfigured && supabaseAdmin) {
    const payload: any = {
      id: event.id,
      timestamp: event.timestamp,
      actor_id: event.actorId,
      actor_name: event.actorName,
      actor_role: event.actorRole,
      action_type: event.actionType,
      target_type: event.targetType,
      target_id: event.targetId,
      summary: event.summary,
    };
    if (hasOrganizationSupport) {
      payload.organization_id = event.organizationId;
    }
    const { error } = await supabaseAdmin.from('audit_events').insert(payload);
    if (error) {
      console.warn('[Supabase Audit Event Error]:', error.message);
    }
  }

  // Keep in-memory cache in sync for instant reads
  dbState.auditEvents.unshift(event);
  if (!isSupabaseConfigured) {
    saveDatabase(dbState);
  }

  return event;
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

  // 1. Supabase Auth JWT Verification (Cryptographic token validation against Supabase Auth)
  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user) {
        let { data: userRecord, error: userDbError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('auth_user_id', data.user.id)
          .maybeSingle();

        // Fallback: If not yet linked by auth_user_id, match by verified email and auto-link
        if (!userRecord && data.user.email) {
          const { data: byEmail } = await supabaseAdmin
            .from('users')
            .select('*')
            .ilike('email', data.user.email)
            .maybeSingle();

          if (byEmail) {
            userRecord = byEmail;
            await supabaseAdmin
              .from('users')
              .update({ auth_user_id: data.user.id })
              .eq('id', byEmail.id);
          }
        }

        if (userRecord && !userDbError) {
          const userOrgId = userRecord.organization_id || 'org-greenwood-1';
          const userStatus = userRecord.status || 'active';
          const emailVerified = Boolean(data.user.email_confirmed_at || userRecord.email_verified);

          req.user = mapUserFromDb({
            ...userRecord,
            organization_id: userOrgId,
            status: userStatus,
            email_verified: emailVerified,
          });
          return next();
        } else {
          console.warn(`[Supabase Auth] Authenticated user ${data.user.email} (UID: ${data.user.id}) has no profile linked in users table.`);
        }
      }
    } catch {
      // Invalid token
    }
  }

  // 2. Demo Mode Session Lookup (Strictly restricted to offline fallback when Supabase is NOT configured)
  if (!isSupabaseConfigured && ENABLE_DEMO_MODE) {
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
      error: 'Authentication required. Please sign in with an authorised organisation account.',
    });
    return;
  }

  if (req.user.status === 'inactive') {
    res.status(403).json({
      error: 'Your organisation membership is currently inactive. Please contact your campus administrator for reactivation.',
      code: 'ACCOUNT_INACTIVE',
    });
    return;
  }

  if (req.user.status === 'invited') {
    res.status(403).json({
      error: 'Your account invitation is pending password setup. Please use the secure setup link sent to your email.',
      code: 'INVITATION_PENDING',
    });
    return;
  }

  if (req.user.emailVerified === false) {
    res.status(403).json({
      error: 'Your email address has not been verified. Please confirm your email address before signing in.',
      code: 'EMAIL_UNVERIFIED',
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
    if (req.user.status === 'inactive') {
      res.status(403).json({ error: 'Your organisation membership is currently inactive.' });
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
  const isStaff = viewer?.role === 'manager' || viewer?.role === 'admin';
  const isAdmin = viewer?.role === 'admin';
  const orgId = viewer?.organizationId || 'org-greenwood-1';

  // Multi-tenancy scoping: filter all records by viewer's organisation
  const orgResources = state.resources.filter((r) => (r.organizationId || 'org-greenwood-1') === orgId);
  const orgBookings = state.bookings.filter((b) => (b.organizationId || 'org-greenwood-1') === orgId);
  const orgIncidents = state.incidents.filter((i) => (i.organizationId || 'org-greenwood-1') === orgId);
  const orgAudit = state.auditEvents.filter((ev) => (ev.organizationId || 'org-greenwood-1') === orgId);
  const orgUsers = state.users.filter((u) => (u.organizationId || 'org-greenwood-1') === orgId);

  const sanitizedBookings = orgBookings.map((b) => {
    if (isStaff || (viewer && b.studentId === viewer.id)) {
      return b;
    }
    // Redact other students' personal names, supervisor, and purpose for student privacy
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
    ? orgUsers
    : isStaff
    ? orgUsers
    : orgUsers.filter((u) => (viewer && u.id === viewer.id) || (u.role !== 'student' && u.role !== 'faculty'));

  const sanitizedAudit = orgAudit.map((ev) => {
    if (isStaff || (viewer && ev.actorId === viewer.id) || (ev.actorRole !== 'student' && ev.actorRole !== 'faculty')) {
      return ev;
    }
    return {
      ...ev,
      actorName: 'Campus Member (Redacted)',
      summary: ev.summary.replace(ev.actorName, 'A campus member'),
    };
  });

  return {
    policy: state.policy,
    resources: orgResources,
    bookings: sanitizedBookings,
    incidents: orgIncidents,
    auditEvents: sanitizedAudit,
    users: sanitizedUsers,
    organizations: state.organizations || [
      {
        id: 'org-greenwood-1',
        name: 'Greenwood College & Senior School',
        slug: 'greenwood-college',
        description: 'Unified campus sharing facility for STEM, robotics, and computing',
      },
    ],
    invitations: isAdmin ? (state.invitations || []).filter((inv) => inv.organizationId === orgId) : [],
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

  app.post('/api/auth/login', (_req, res) => {
    res.status(401).json({
      error:
        'Passwordless login is disabled for campus security. Please sign in with your email and password via Supabase Auth.',
    });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.token) {
      activeSessions.delete(req.token);
    }
    res.json({ ok: true });
  });

  // --- STATE READ & RESET ---
  app.get('/api/state', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const viewer = req.user;
      let state: AppDatabaseState;
      if (isSupabaseConfigured) {
        state = await loadStateFromSupabase();
      } else if (ENABLE_DEMO_MODE) {
        state = dbState;
      } else {
        res.status(500).json({ error: 'Database is not configured and demo mode is disabled.' });
        return;
      }

      res.json({
        viewer: viewer ?? null,
        state: sanitizeStateForViewer(state, viewer),
      });
    } catch (err: any) {
      console.error('[GET /api/state error]:', err.message);
      res.status(500).json({ error: `Failed to load state from database: ${err.message}` });
    }
  });

  app.post('/api/demo/reset', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    if (!ENABLE_DEMO_MODE) {
      res.status(403).json({ error: 'Dataset reset is disabled in production.' });
      return;
    }
    dbState = structuredClone(INITIAL_DATABASE_STATE);
    saveDatabase(dbState);
    const viewer = req.user;
    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    res.json({
      message: 'Demonstration dataset reset to initial state.',
      state: sanitizeStateForViewer(currentState, viewer),
    });
  });

  // --- BOOKING WORKFLOW ---
  app.post('/api/bookings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
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

      // Read current state from database
      const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

      const resource = currentState.resources.find((r) => r.id === resourceId);
      if (!resource) {
        res.status(404).json({ error: 'Selected resource does not exist.' });
        return;
      }

      // Cross-organisation access guard
      const userOrgId = user.organizationId || 'org-greenwood-1';
      const resourceOrgId = resource.organizationId || 'org-greenwood-1';
      if (userOrgId !== resourceOrgId) {
        res.status(403).json({ error: 'Access denied: Selected resource belongs to a different organisation.' });
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
      const studentPendingCount = currentState.bookings.filter(
        (b) => b.studentId === user.id && b.status === 'Pending'
      ).length;
      if (studentPendingCount >= currentState.policy.maxActivePendingRequestsPerStudent) {
        res.status(429).json({
          error: `Fair Access Policy: You already have ${studentPendingCount} pending requests (limit: ${currentState.policy.maxActivePendingRequestsPerStudent}). Please wait for manager review or cancel an existing request.`,
        });
        return;
      }

      // Fair access check 2: Weekly hours quota on this resource
      const studentResourceHours = currentState.bookings
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
      const conflictingApproved = currentState.bookings.find(
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
        id: `BKG-2026-${Math.floor(804 + currentState.bookings.length + Math.random() * 50)}`,
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
        organizationId: userOrgId,
      };

      // Persist to Supabase PostgreSQL with verified IST timestamps converted to absolute UTC
      if (isSupabaseConfigured && supabaseAdmin) {
        const startTimestamp = toCampusTimestamp(newBooking.date, newBooking.startTime);
        const endTimestamp = toCampusTimestamp(newBooking.date, newBooking.endTime);

        const insertPayload: any = {
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
        };
        if (hasOrganizationSupport) {
          insertPayload.organization_id = userOrgId;
        }

        const { error: insertError } = await supabaseAdmin!.from('bookings').insert(insertPayload);
        if (insertError) {
          console.error('[Supabase Booking Insert Error]:', insertError.message);
          if (
            insertError.message.includes('prevent_conflicting_approved_bookings') ||
            insertError.code === '23P01'
          ) {
            res.status(409).json({
              error: 'Conflict constraint violation: A conflicting booking already exists for this slot.',
            });
            return;
          }
          res.status(500).json({ error: `Failed to persist booking in database: ${insertError.message}` });
          return;
        }
      } else {
        dbState.bookings.unshift(newBooking);
        saveDatabase(dbState);
      }

      await appendAudit(
        user,
        'BOOKING_SUBMITTED',
        'Booking',
        newBooking.id,
        `Submitted booking request ${newBooking.id} for ${resource.code} on ${date} (${startTime}–${endTime} IST).`
      );

      const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

      res.status(201).json({
        booking: newBooking,
        state: sanitizeStateForViewer(updatedState, user),
      });
    } catch (err: any) {
      console.error('[POST /api/bookings error]:', err.message);
      res.status(500).json({ error: `Internal error creating booking: ${err.message}` });
    }
  });

  // --- MANAGER DECISION (APPROVE / REJECT / WAITLIST) ---
  app.post(
    '/api/bookings/:id/decision',
    requireRole(['manager', 'admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      let booking: BookingRequest | undefined;
      const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

      booking = currentState.bookings.find((b) => b.id === req.params.id);
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
        const resource = currentState.resources.find((r) => r.id === booking!.resourceId);
        if (resource && (resource.status === 'Maintenance' || resource.status === 'Restricted')) {
          res.status(409).json({
            error: `Cannot approve: Resource ${resource.code} is currently in ${resource.status} status.`,
          });
          return;
        }

        const conflictingApproved = currentState.bookings.find(
          (b) =>
            b.id !== booking!.id &&
            b.resourceId === booking!.resourceId &&
            b.date === booking!.date &&
            (b.status === 'Approved' || b.status === 'CheckedIn') &&
            intervalsOverlap(booking!.startTime, booking!.endTime, b.startTime, b.endTime)
        );

        if (conflictingApproved) {
          res.status(409).json({
            error: `Conflict Safeguard: Cannot approve ${booking.id} (${booking.startTime}–${booking.endTime} on ${booking.date}) because ${conflictingApproved.id} (${conflictingApproved.studentName}) is already Approved for ${conflictingApproved.startTime}–${conflictingApproved.endTime}. You may Waitlist or Reject this request instead.`,
          });
          return;
        }
      }

      const managerDecisionNote =
        note?.trim() ||
        (decision === 'Approved'
          ? 'Approved after eligibility and schedule verification.'
          : decision === 'Waitlisted'
          ? 'Placed on waitlist pending slot availability.'
          : 'Request declined by resource custodian.');
      const decidedAt = new Date().toISOString();

      if (isSupabaseConfigured) {
        const { error: updateErr } = await supabaseAdmin!
          .from('bookings')
          .update({
            status: decision,
            manager_decision_note: managerDecisionNote,
            decided_by_name: actor.name,
            decided_at: decidedAt,
          })
          .eq('id', booking.id);

        if (updateErr) {
          if (
            updateErr.message.includes('prevent_conflicting_approved_bookings') ||
            updateErr.code === '23P01'
          ) {
            res.status(409).json({
              error: 'Conflict constraint violation: A conflicting booking already exists for this slot.',
            });
            return;
          }
          res.status(500).json({ error: `Failed to update booking decision in database: ${updateErr.message}` });
          return;
        }
      } else {
        booking.status = decision;
        booking.managerDecisionNote = managerDecisionNote;
        booking.decidedByName = actor.name;
        booking.decidedAt = decidedAt;
        saveDatabase(dbState);
      }

      const actionMap = {
        Approved: 'BOOKING_APPROVED',
        Rejected: 'BOOKING_REJECTED',
        Waitlisted: 'BOOKING_WAITLISTED',
      } as const;

      await appendAudit(
        actor,
        actionMap[decision],
        'Booking',
        booking.id,
        `${decision} booking ${booking.id} (${booking.studentName}) for ${booking.resourceCode} on ${booking.date} (${booking.startTime}–${booking.endTime}). Note: ${managerDecisionNote}`
      );

      const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
      const updatedBooking = updatedState.bookings.find((b) => b.id === booking!.id) || booking;

      res.json({
        booking: updatedBooking,
        state: sanitizeStateForViewer(updatedState, actor),
      });
    }
  );

  // --- CANCEL BOOKING ---
  app.post('/api/bookings/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const booking = currentState.bookings.find((b) => b.id === req.params.id);
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

    if (isSupabaseConfigured) {
      const { error: cancelErr } = await supabaseAdmin!
        .from('bookings')
        .update({ status: 'Cancelled' })
        .eq('id', booking.id);

      if (cancelErr) {
        res.status(500).json({ error: `Failed to cancel booking in database: ${cancelErr.message}` });
        return;
      }
    } else {
      booking.status = 'Cancelled';
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'BOOKING_CANCELLED',
      'Booking',
      booking.id,
      `Cancelled booking ${booking.id} for ${booking.resourceCode} (${booking.date} ${booking.startTime}–${booking.endTime}).`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const updatedBooking = updatedState.bookings.find((b) => b.id === booking.id) || booking;

    res.json({
      booking: updatedBooking,
      state: sanitizeStateForViewer(updatedState, actor),
    });
  });

  // --- CHECK-IN & BEFORE-USE CONDITION REPORT ---
  app.post('/api/bookings/:id/checkin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const booking = currentState.bookings.find((b) => b.id === req.params.id);
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

    if (isSupabaseConfigured) {
      const { error: bErr } = await supabaseAdmin!
        .from('bookings')
        .update({
          status: 'CheckedIn',
          check_in_at: report.timestamp,
          before_condition_report: report,
        })
        .eq('id', booking.id);

      if (bErr) {
        res.status(500).json({ error: `Failed to record check-in in database: ${bErr.message}` });
        return;
      }

      const resource = currentState.resources.find((r) => r.id === booking!.resourceId);
      if (resource && resource.status === 'Available') {
        await supabaseAdmin!
          .from('resources')
          .update({
            status: 'In Use',
            condition_summary: `${rating} — Checked in by ${actor.name}: ${notes.trim()}`,
          })
          .eq('id', booking.resourceId);
      }
    } else {
      booking.status = 'CheckedIn';
      booking.checkInAt = report.timestamp;
      booking.beforeConditionReport = report;
      const resource = dbState.resources.find((r) => r.id === booking!.resourceId);
      if (resource && resource.status === 'Available') {
        resource.status = 'In Use';
        resource.conditionSummary = `${rating} — Checked in by ${actor.name}: ${notes.trim()}`;
      }
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'CHECK_IN_COMPLETED',
      'Booking',
      booking.id,
      `Checked in to ${booking.resourceCode} (${booking.id}). Before-use condition: ${rating}.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const updatedBooking = updatedState.bookings.find((b) => b.id === booking.id) || booking;

    res.json({
      booking: updatedBooking,
      state: sanitizeStateForViewer(updatedState, actor),
    });
  });

  // --- CHECK-OUT & AFTER-USE CONDITION REPORT ---
  app.post('/api/bookings/:id/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const booking = currentState.bookings.find((b) => b.id === req.params.id);
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

    const flaggedMissing = !booking.beforeConditionReport;

    if (isSupabaseConfigured) {
      const { error: bErr } = await supabaseAdmin!
        .from('bookings')
        .update({
          status: 'Completed',
          check_out_at: report.timestamp,
          after_condition_report: report,
          flagged_missing_report: flaggedMissing,
        })
        .eq('id', booking.id);

      if (bErr) {
        res.status(500).json({ error: `Failed to record check-out in database: ${bErr.message}` });
        return;
      }

      const newResStatus = rating === 'Damaged — Unsafe / Faulty' ? 'Maintenance' : 'Available';
      const conditionSummary = `${rating} — Last returned ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${notes.trim()}`;
      await supabaseAdmin!
        .from('resources')
        .update({
          status: newResStatus,
          condition_summary: conditionSummary,
        })
        .eq('id', booking.resourceId);
    } else {
      booking.status = 'Completed';
      booking.checkOutAt = report.timestamp;
      booking.afterConditionReport = report;
      booking.flaggedMissingReport = flaggedMissing;
      const resource = dbState.resources.find((r) => r.id === booking!.resourceId);
      if (resource) {
        resource.status = rating === 'Damaged — Unsafe / Faulty' ? 'Maintenance' : 'Available';
        resource.conditionSummary = `${rating} — Last returned ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${notes.trim()}`;
      }
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'CHECK_OUT_COMPLETED',
      'Booking',
      booking.id,
      `Completed check-out for ${booking.resourceCode} (${booking.id}). After-use condition: ${rating}.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const updatedBooking = updatedState.bookings.find((b) => b.id === booking.id) || booking;

    res.json({
      booking: updatedBooking,
      state: sanitizeStateForViewer(updatedState, actor),
    });
  });

  // --- INCIDENT REPORTING & REVIEW ---
  app.post('/api/incidents', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const { resourceId, bookingId, category, severity, description, supportingImageRef } = req.body as Partial<IncidentReport>;

    if (!resourceId || !category || !severity || !description?.trim()) {
      res.status(400).json({ error: 'Resource, incident category, severity, and detailed description are required.' });
      return;
    }

    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const resource = currentState.resources.find((r) => r.id === resourceId);
    if (!resource) {
      res.status(404).json({ error: 'Related resource not found.' });
      return;
    }

    const now = new Date().toISOString();
    const incidentId = `INC-2026-${Math.floor(103 + currentState.incidents.length)}`;
    const hasOrgSupport = await checkOrganizationSupport();

    const incident: IncidentReport = {
      id: incidentId,
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
      organizationId: actor.organizationId || 'org-greenwood-1',
      createdAt: now,
      updatedAt: now,
    };

    if (isSupabaseConfigured) {
      const incPayload: any = {
        id: incident.id,
        resource_id: incident.resourceId,
        resource_name: incident.resourceName,
        resource_code: incident.resourceCode,
        booking_id: incident.bookingId || null,
        reported_by_user_id: incident.reportedByUserId,
        reported_by_name: incident.reportedByName,
        reported_by_role: incident.reportedByRole,
        category: incident.category,
        severity: incident.severity,
        description: incident.description,
        supporting_image_ref: incident.supportingImageRef || null,
        status: incident.status,
        human_review_required: incident.humanReviewRequired,
      };
      if (hasOrgSupport) {
        incPayload.organization_id = actor.organizationId || 'org-greenwood-1';
      }
      const { error: incErr } = await supabaseAdmin!.from('incidents').insert(incPayload);
      if (incErr) {
        res.status(500).json({ error: `Failed to persist incident in database: ${incErr.message}` });
        return;
      }
      if (severity === 'Critical' || severity === 'High') {
        await supabaseAdmin!.from('resources').update({ status: 'Maintenance' }).eq('id', resource.id);
      }
    } else {
      if (severity === 'Critical' || severity === 'High') {
        resource.status = 'Maintenance';
      }
      dbState.incidents.unshift(incident);
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'INCIDENT_REPORTED',
      'Incident',
      incident.id,
      `Reported ${severity.toLowerCase()}-severity incident (${category}) on ${resource.code}. Human custodian review required.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

    res.status(201).json({
      incident,
      state: sanitizeStateForViewer(updatedState, actor),
    });
  });

  app.patch(
    '/api/incidents/:id',
    requireRole(['manager', 'admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
      const incident = currentState.incidents.find((i) => i.id === req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident record not found.' });
        return;
      }

      const { status, managerReviewNotes, updateResourceStatus } = req.body as {
        status?: IncidentReport['status'];
        managerReviewNotes?: string;
        updateResourceStatus?: Resource['status'];
      };

      const newStatus = status || incident.status;
      const notes = managerReviewNotes !== undefined ? managerReviewNotes.trim() : incident.managerReviewNotes;
      const updatedAt = new Date().toISOString();

      if (isSupabaseConfigured) {
        const updateData: any = {
          status: newStatus,
          manager_review_notes: notes || null,
          reviewed_by_name: actor.name,
          updated_at: updatedAt,
        };
        const { error: incErr } = await supabaseAdmin!.from('incidents').update(updateData).eq('id', incident.id);
        if (incErr) {
          res.status(500).json({ error: `Failed to update incident in database: ${incErr.message}` });
          return;
        }
        if (updateResourceStatus) {
          await supabaseAdmin!.from('resources').update({ status: updateResourceStatus }).eq('id', incident.resourceId);
        }
      } else {
        incident.status = newStatus;
        if (notes !== undefined) incident.managerReviewNotes = notes;
        incident.reviewedByName = actor.name;
        incident.updatedAt = updatedAt;
        if (updateResourceStatus) {
          const resource = dbState.resources.find((r) => r.id === incident!.resourceId);
          if (resource) resource.status = updateResourceStatus;
        }
        saveDatabase(dbState);
      }

      await appendAudit(
        actor,
        'INCIDENT_STATUS_UPDATED',
        'Incident',
        incident.id,
        `Updated incident ${incident.id} on ${incident.resourceCode} to '${newStatus}'. Review note: ${notes || 'Recorded'}.`
      );

      const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
      const updatedIncident = updatedState.incidents.find((i) => i.id === incident!.id) || incident;

      res.json({
        incident: updatedIncident,
        state: sanitizeStateForViewer(updatedState, actor),
      });
    }
  );

  // --- AI INCIDENT ASSISTANT (STAFF ONLY) ---
  app.post(
    '/api/ai/analyze-incident',
    requireRole(['manager', 'admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!aiClient) {
          res.status(503).json({
            error: 'Gemini AI assistant is not configured. Please ensure GEMINI_API_KEY is set in the server environment.',
          });
          return;
        }

        const {
          incidentId,
          description,
          category,
          severity,
          resourceName,
          resourceCode,
          resourceCategory,
          location,
        } = req.body as {
          incidentId?: string;
          description?: string;
          category?: string;
          severity?: string;
          resourceName?: string;
          resourceCode?: string;
          resourceCategory?: string;
          location?: string;
        };

        if (!incidentId || !incidentId.trim()) {
          res.status(400).json({ error: 'Valid incident ID is required for AI analysis.' });
          return;
        }

        if (!description || !description.trim()) {
          res.status(400).json({ error: 'Incident description is required for AI analysis.' });
          return;
        }

        // Only send non-sensitive technical details (strictly no user identifiers or emails)
        const prompt = [
          'You are an educational institution technical equipment custodian and incident triage assistant.',
          'Analyze the following equipment incident report submitted at an educational campus:',
          `- Resource: ${resourceName || 'Educational Equipment'} (${resourceCode || 'N/A'})`,
          `- Category: ${resourceCategory || 'Campus Equipment'}`,
          `- Location: ${location || 'Campus Lab'}`,
          `- Reported Incident Category: ${category || 'Unspecified'}`,
          `- Reported Severity: ${severity || 'Unspecified'}`,
          '- Incident Description:',
          `"""${description.trim()}"""`,
          '',
          'Provide a concise, objective triage assessment strictly conforming to the requested JSON schema.',
        ].join('\n');

        const modelCandidates = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
        let rawText: string | null = null;
        let lastError: Error | null = null;

        for (const candidate of modelCandidates) {
          try {
            const geminiRes = await aiClient.models.generateContent({
              model: candidate,
              contents: prompt,
              config: {
                systemInstruction:
                  'You are an expert technical equipment custodian assistant in an educational laboratory. Your task is to analyze incident descriptions objectively and provide practical, staff-oriented triage information. Always return valid JSON conforming to the schema.',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: {
                      type: Type.STRING,
                      description: 'Short 1-2 sentence summary of the reported technical issue',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'Technical categorization of the issue (e.g. Hardware Defect, Accidental Damage, Missing Cable, Component Burnout, Calibration Needed)',
                    },
                    priority: {
                      type: Type.STRING,
                      enum: ['Low', 'Medium', 'High'],
                      description: 'Suggested maintenance priority level',
                    },
                    recommendedNextAction: {
                      type: Type.STRING,
                      description: 'Concrete, practical recommended next action for lab staff/custodian',
                    },
                  },
                  required: ['summary', 'category', 'priority', 'recommendedNextAction'],
                },
              },
            });
            if (geminiRes.text) {
              rawText = geminiRes.text;
              break;
            }
          } catch (mErr: any) {
            lastError = mErr;
            console.warn(`[Gemini AI] Model ${candidate} request failed, trying next candidate:`, mErr?.message || mErr);
          }
        }

        if (!rawText) {
          throw lastError || new Error('Gemini models returned an empty response.');
        }

        const parsed = JSON.parse(rawText);

        let priority: 'Low' | 'Medium' | 'High' = 'Medium';
        if (parsed.priority === 'Low' || parsed.priority === 'Medium' || parsed.priority === 'High') {
          priority = parsed.priority;
        }

        res.json({
          analysis: {
            summary: String(parsed.summary || 'Summary unavailable.').trim(),
            category: String(parsed.category || category || 'General Issue').trim(),
            priority,
            recommendedNextAction: String(parsed.recommendedNextAction || 'Inspect the resource manually.').trim(),
          },
        });
      } catch (err: any) {
        console.error(`[Gemini AI] Incident analysis error for incident '${req.body?.incidentId || 'unknown'}':`, err);

        let sanitizedMessage = 'The AI Incident Assistant is momentarily unavailable. Please try again.';
        const errMsg = String(err?.message || '');
        if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand')) {
          sanitizedMessage = 'The AI model is experiencing a temporary demand spike. Please retry in a few moments.';
        } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          sanitizedMessage = 'AI analysis rate limit reached. Please wait a moment before retrying.';
        }

        res.status(503).json({ error: sanitizedMessage });
      }
    }
  );

  // --- RESOURCE CREATION & MANAGEMENT (MANAGER / ADMIN) ---
  app.post(
    '/api/resources',
    requireRole(['manager', 'admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const body = req.body as Partial<Resource>;
      if (!body.name?.trim() || !body.code?.trim() || !body.category || !body.location?.trim()) {
        res.status(400).json({ error: 'Resource name, code, category, and location are required.' });
        return;
      }

      const hasOrgSupport = await checkOrganizationSupport();
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
          : ['Enrolled student or faculty in good standing', 'Completed basic laboratory safety orientation'],
        requiredSafetyModule: body.requiredSafetyModule || 'Lab Safety & Basic Electrical Orientation',
        safetyRules: body.safetyRules?.length
          ? body.safetyRules
          : [
              'Check condition before and after use.',
              'Report missing cables or damage immediately.',
            ],
        managerId: actor.id,
        managerName: actor.name,
        isDemoListing: false,
        organizationId: actor.organizationId || 'org-greenwood-1',
        specifications: body.specifications || {
          'Added By': actor.name,
          'Educational Status': 'Active',
        },
      };

      if (isSupabaseConfigured) {
        const resPayload: any = {
          id: newResource.id,
          code: newResource.code,
          name: newResource.name,
          category: newResource.category,
          resource_type: newResource.resourceType,
          location: newResource.location,
          building: newResource.building,
          description: newResource.description,
          image_url: newResource.imageUrl,
          status: newResource.status,
          condition_summary: newResource.conditionSummary,
          operating_hours: newResource.operatingHours,
          available_time_slots: newResource.availableTimeSlots,
          min_duration_hours: newResource.minDurationHours,
          max_duration_hours: newResource.maxDurationHours,
          weekly_limit_hours_per_student: newResource.weeklyLimitHoursPerStudent,
          cooldown_hours: newResource.cooldownHours,
          eligibility_requirements: newResource.eligibilityRequirements,
          required_safety_module: newResource.requiredSafetyModule,
          safety_rules: newResource.safetyRules,
          manager_id: actor.id,
          manager_name: actor.name,
          is_demo_listing: false,
          specifications: newResource.specifications,
        };
        if (hasOrgSupport) {
          resPayload.organization_id = actor.organizationId || 'org-greenwood-1';
        }
        const { error: resErr } = await supabaseAdmin!.from('resources').insert(resPayload);
        if (resErr) {
          res.status(500).json({ error: `Failed to persist resource in database: ${resErr.message}` });
          return;
        }
      } else {
        dbState.resources.unshift(newResource);
        saveDatabase(dbState);
      }

      await appendAudit(
        actor,
        'RESOURCE_CREATED',
        'Resource',
        newResource.id,
        `Added new resource listing ${newResource.code} (${newResource.name}) in ${newResource.location}.`
      );

      const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

      res.status(201).json({
        resource: newResource,
        state: sanitizeStateForViewer(updatedState, actor),
      });
    }
  );

  app.patch(
    '/api/resources/:id',
    requireRole(['manager', 'admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
      const resource = currentState.resources.find((r) => r.id === req.params.id);
      if (!resource) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }

      const updates = req.body as Partial<Resource>;
      if (isSupabaseConfigured) {
        const updateData: any = {};
        if (updates.name !== undefined) updateData.name = updates.name.trim();
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.conditionSummary !== undefined) updateData.condition_summary = updates.conditionSummary.trim();
        if (updates.operatingHours !== undefined) updateData.operating_hours = updates.operatingHours.trim();
        if (updates.maxDurationHours !== undefined) updateData.max_duration_hours = Number(updates.maxDurationHours);
        if (updates.weeklyLimitHoursPerStudent !== undefined) {
          updateData.weekly_limit_hours_per_student = Number(updates.weeklyLimitHoursPerStudent);
        }
        if (updates.location !== undefined) updateData.location = updates.location.trim();

        const { error: resErr } = await supabaseAdmin!.from('resources').update(updateData).eq('id', resource.id);
        if (resErr) {
          res.status(500).json({ error: `Failed to update resource in database: ${resErr.message}` });
          return;
        }
      } else {
        if (updates.name !== undefined) resource.name = updates.name.trim();
        if (updates.status !== undefined) resource.status = updates.status;
        if (updates.conditionSummary !== undefined) resource.conditionSummary = updates.conditionSummary.trim();
        if (updates.operatingHours !== undefined) resource.operatingHours = updates.operatingHours.trim();
        if (updates.maxDurationHours !== undefined) resource.maxDurationHours = Number(updates.maxDurationHours);
        if (updates.weeklyLimitHoursPerStudent !== undefined) {
          resource.weeklyLimitHoursPerStudent = Number(updates.weeklyLimitHoursPerStudent);
        }
        if (updates.location !== undefined) resource.location = updates.location.trim();
        saveDatabase(dbState);
      }

      await appendAudit(
        actor,
        'RESOURCE_UPDATED',
        'Resource',
        resource.id,
        `Updated resource ${resource.code}: status='${updates.status || resource.status}'.`
      );

      const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
      const updatedResource = updatedState.resources.find((r) => r.id === resource!.id) || resource;

      res.json({
        resource: updatedResource,
        state: sanitizeStateForViewer(updatedState, actor),
      });
    }
  );

  // --- ADMIN ENDPOINTS (ORGANISATION MEMBERS, USER ROLES & PLATFORM POLICY) ---
  app.patch('/api/users/:id/role', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Access denied: Only administrators can modify roles or restrictions.' });
      return;
    }

    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const targetUser = currentState.users.find((u) => u.id === req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found in organisation directory.' });
      return;
    }

    // Cross-organisation isolation
    if ((targetUser.organizationId || 'org-greenwood-1') !== (actor.organizationId || 'org-greenwood-1')) {
      res.status(403).json({ error: 'Access denied: Member belongs to a different organisation.' });
      return;
    }

    const { role, activeRestrictions } = req.body as {
      role?: UserRole;
      activeRestrictions?: string | null;
    };

    const newRole = role && ['student', 'faculty', 'manager', 'admin'].includes(role) ? role : targetUser.role;
    const newRestrictions = activeRestrictions !== undefined ? activeRestrictions : targetUser.activeRestrictions;

    if (isSupabaseConfigured) {
      const { error: uErr } = await supabaseAdmin!
        .from('users')
        .update({
          role: newRole,
          active_restrictions: newRestrictions,
        })
        .eq('id', targetUser.id);

      if (uErr) {
        res.status(500).json({ error: `Failed to update user role in database: ${uErr.message}` });
        return;
      }
    } else {
      targetUser.role = newRole;
      targetUser.activeRestrictions = newRestrictions;
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'ROLE_UPDATED',
      'User',
      targetUser.id,
      `Administrator updated ${targetUser.name}: role='${newRole}', restrictions='${newRestrictions || 'None'}'.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const updatedUser = updatedState.users.find((u) => u.id === targetUser!.id) || targetUser;

    res.json({
      user: updatedUser,
      state: sanitizeStateForViewer(updatedState, actor),
    });
  });

  // Admin member invitation endpoint (Supabase Auth invite flow)
  app.post('/api/admin/members/invite', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const { email, name, role, department } = req.body as {
      email?: string;
      name?: string;
      role?: UserRole;
      department?: string;
    };

    if (!email?.trim() || !name?.trim() || !role || !department?.trim()) {
      res.status(400).json({ error: 'Email, full name, role, and department are required to invite a member.' });
      return;
    }

    const validRoles: UserRole[] = ['student', 'faculty', 'manager', 'admin'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `Invalid role specified. Permitted roles: ${validRoles.join(', ')}.` });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const orgId = actor.organizationId || 'org-greenwood-1';

    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const existingUser = currentState.users.find(
      (u) => (u.organizationId || 'org-greenwood-1') === orgId && u.email.toLowerCase() === cleanEmail
    );
    if (existingUser) {
      res.status(400).json({ error: `A member with email '${cleanEmail}' is already registered in this organisation.` });
      return;
    }

    let invitedAuthId: string | undefined;

    // Trigger Supabase Auth invitation email if configured
    if (supabaseAdmin) {
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
        data: {
          name: name.trim(),
          role,
          department: department.trim(),
          organizationId: orgId,
        },
        redirectTo: process.env.APP_URL || undefined,
      });

      if (inviteErr) {
        console.error('[Supabase Invite Error]:', inviteErr.message);
        res.status(502).json({
          error: `Supabase Auth invitation error: ${inviteErr.message}. Please ensure SMTP or custom email delivery is configured in your Supabase project settings.`,
        });
        return;
      }
      invitedAuthId = inviteData?.user?.id;
    }

    const newUserId = `usr-${role.slice(0, 3)}-${Date.now().toString().slice(-4)}`;
    const hasOrgSupport = await checkOrganizationSupport();

    const newMember: User = {
      id: newUserId,
      name: name.trim(),
      email: cleanEmail,
      department: department.trim(),
      academicStanding:
        role === 'faculty'
          ? 'Faculty Member'
          : role === 'manager'
          ? 'Resource Manager'
          : role === 'admin'
          ? 'Campus Administrator'
          : 'Student in Good Standing',
      role,
      completedSafetyModules: [],
      activeRestrictions: null,
      organizationId: orgId,
      organizationName: actor.organizationName || 'Greenwood College & Senior School',
      status: 'invited',
      emailVerified: false,
    };

    if (isSupabaseConfigured) {
      const userPayload: any = {
        id: newMember.id,
        auth_user_id: invitedAuthId || null,
        name: newMember.name,
        email: newMember.email,
        department: newMember.department,
        academic_standing: newMember.academicStanding,
        role: newMember.role,
        active_restrictions: null,
        completed_safety_modules: [],
      };
      if (hasOrgSupport) {
        userPayload.organization_id = orgId;
        userPayload.status = 'invited';
        userPayload.email_verified = false;
      }

      const { error: userErr } = await supabaseAdmin!.from('users').insert(userPayload);
      if (userErr) {
        res.status(500).json({ error: `Failed to insert user profile in database: ${userErr.message}` });
        return;
      }

      if (hasOrgSupport) {
        await supabaseAdmin!.from('organization_invitations').insert({
          id: `inv-${Date.now().toString().slice(-6)}`,
          organization_id: orgId,
          email: cleanEmail,
          role,
          name: name.trim(),
          department: department.trim(),
          invited_by_user_id: actor.id,
          expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
          status: 'pending',
        });
      }
    } else {
      dbState.users.push(newMember);
      const newInvitation: OrganizationInvitation = {
        id: `inv-${Date.now().toString().slice(-6)}`,
        organizationId: orgId,
        email: cleanEmail,
        role,
        name: name.trim(),
        department: department.trim(),
        invitedByUserId: actor.id,
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      if (!dbState.invitations) dbState.invitations = [];
      dbState.invitations.unshift(newInvitation);
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'MEMBER_INVITED',
      'User',
      newMember.id,
      `Administrator invited ${newMember.name} (${newMember.email}) as ${role.toUpperCase()} to organisation.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

    res.status(201).json({
      success: true,
      member: newMember,
      state: sanitizeStateForViewer(updatedState, actor),
      message: `Invitation successfully sent to ${cleanEmail}. The member will receive a secure expiring setup link.`,
    });
  });

  // Admin member status update (Activate / Deactivate)
  app.patch('/api/admin/members/:id/status', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const targetId = req.params.id;
    const { status } = req.body as { status?: 'active' | 'inactive' };

    if (!status || !['active', 'inactive'].includes(status)) {
      res.status(400).json({ error: "Valid status ('active' or 'inactive') is required." });
      return;
    }

    if (actor.id === targetId && status === 'inactive') {
      res.status(400).json({ error: 'You cannot deactivate your own administrative account.' });
      return;
    }

    const currentState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const targetUser = currentState.users.find((u) => u.id === targetId);
    if (!targetUser) {
      res.status(404).json({ error: 'Member not found in organisation directory.' });
      return;
    }

    if ((targetUser.organizationId || 'org-greenwood-1') !== (actor.organizationId || 'org-greenwood-1')) {
      res.status(403).json({ error: 'Access denied: Target member belongs to a different organisation.' });
      return;
    }

    if (isSupabaseConfigured) {
      const hasOrgSupport = await checkOrganizationSupport();
      if (hasOrgSupport) {
        const { error: updateErr } = await supabaseAdmin!.from('users').update({ status }).eq('id', targetId);
        if (updateErr) {
          res.status(500).json({ error: `Failed to update member status in database: ${updateErr.message}` });
          return;
        }
      }
    } else {
      targetUser.status = status;
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'MEMBER_STATUS_UPDATED',
      'User',
      targetUser.id,
      `Administrator updated member status of ${targetUser.name} to ${status.toUpperCase()}.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;
    const updatedUser = updatedState.users.find((u) => u.id === targetId) || targetUser;

    res.json({
      user: updatedUser,
      state: sanitizeStateForViewer(updatedState, actor),
      message: `Member ${targetUser.name} is now ${status}.`,
    });
  });

  app.patch('/api/policy', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const updates = req.body as Partial<PlatformPolicySettings>;

    if (isSupabaseConfigured) {
      const policyUpdates: any = {
        updated_at: new Date().toISOString(),
      };
      if (updates.maxActivePendingRequestsPerStudent !== undefined) {
        policyUpdates.max_active_pending_requests_per_student = Number(updates.maxActivePendingRequestsPerStudent);
      }
      if (updates.defaultWeeklyHoursCapPerStudent !== undefined) {
        policyUpdates.default_weekly_hours_cap_per_student = Number(updates.defaultWeeklyHoursCapPerStudent);
      }
      if (updates.defaultCooldownHoursBetweenBookings !== undefined) {
        policyUpdates.default_cooldown_hours_between_bookings = Number(updates.defaultCooldownHoursBetweenBookings);
      }
      if (updates.requireBeforeAndAfterConditionReports !== undefined) {
        policyUpdates.require_before_and_after_condition_reports = Boolean(updates.requireBeforeAndAfterConditionReports);
      }

      const { error: polErr } = await supabaseAdmin!
        .from('platform_policy')
        .update(policyUpdates)
        .eq('id', 1);

      if (polErr) {
        res.status(500).json({ error: `Failed to update platform policy in database: ${polErr.message}` });
        return;
      }
    } else {
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
      saveDatabase(dbState);
    }

    await appendAudit(
      actor,
      'POLICY_UPDATED',
      'Policy',
      'GLOBAL-POLICY',
      `Updated fair-access policy settings.`
    );

    const updatedState = isSupabaseConfigured ? await loadStateFromSupabase() : dbState;

    res.json({
      policy: updatedState.policy,
      state: sanitizeStateForViewer(updatedState, actor),
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
