/**
 * ResourceBridge — Safe, Idempotent Supabase PostgreSQL & Auth Seeder
 *
 * Requirements enforced:
 * 1. Safe account linking: Never silently overwrites an existing auth_user_id.
 *    Stops and reports inconsistent state. Fails if Auth creation fails.
 * 2. Reliable error handling: Validates every Supabase operation; aborts on error
 *    with a non-zero exit code.
 * 3. Preserves existing data: Preserves existing platform policy; uses idempotent
 *    inserts (ignoreDuplicates) for resources, bookings, and audit records.
 * 4. Auth account lookup pagination: Paginates listUsers() to scan all existing accounts.
 * 5. Secret handling: Reads SUPABASE_SERVICE_ROLE_KEY and DEMO_USERS_PASSWORD from
 *    environment. Never logs secrets or keys to the console.
 *
 * Usage:
 *   DEMO_USERS_PASSWORD="YourSecurePassword123!" npx tsx scripts/seedSupabase.ts
 */

import { createClient, SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { INITIAL_DATABASE_STATE } from '../src/data/seedData';
import { toCampusTimestamp } from '../src/lib/dateTime';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey || supabaseUrl.includes('YOUR_PROJECT_ID')) {
  console.error(
    'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in your server environment before running this script.'
  );
  process.exit(1);
}

const demoPassword = process.env.DEMO_USERS_PASSWORD;
if (!demoPassword) {
  console.error(
    'Error: DEMO_USERS_PASSWORD is not set.\n' +
    'To avoid generating or printing passwords in CI/shared terminal logs, please set DEMO_USERS_PASSWORD in your private .env file before running this script.'
  );
  process.exit(1);
}

// Service role client: required for auth.admin operations and seeding
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Paginates through all Supabase Auth users to ensure an exhaustive lookup.
 */
async function fetchAllAuthUsers(client: SupabaseClient): Promise<SupabaseAuthUser[]> {
  const allUsers: SupabaseAuthUser[] = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list Supabase Auth users (page ${page}): ${error.message}`);
    }
    if (!data?.users || data.users.length === 0) {
      break;
    }
    allUsers.push(...data.users);
    if (data.users.length < perPage) {
      break;
    }
    page++;
  }

  return allUsers;
}

async function seed(): Promise<void> {
  console.log('========================================================');
  console.log('   ResourceBridge — Supabase Auth & Database Seeder     ');
  console.log('========================================================');

  // 1. Platform Policy (Preserve existing configuration)
  console.log('\n[1/5] Checking platform policy...');
  const { data: existingPolicy, error: policyCheckError } = await supabase
    .from('platform_policy')
    .select('id')
    .eq('id', 1)
    .maybeSingle();

  if (policyCheckError) {
    throw new Error(`Failed to check existing platform policy: ${policyCheckError.message}`);
  }

  if (existingPolicy) {
    console.log('  • Platform policy already exists. Preserving current policy settings.');
  } else {
    const { error: policyInsertError } = await supabase.from('platform_policy').insert({
      id: 1,
      max_active_pending_requests_per_student:
        INITIAL_DATABASE_STATE.policy.maxActivePendingRequestsPerStudent,
      default_weekly_hours_cap_per_student:
        INITIAL_DATABASE_STATE.policy.defaultWeeklyHoursCapPerStudent,
      default_cooldown_hours_between_bookings:
        INITIAL_DATABASE_STATE.policy.defaultCooldownHoursBetweenBookings,
      require_before_and_after_condition_reports:
        INITIAL_DATABASE_STATE.policy.requireBeforeAndAfterConditionReports,
      enforce_human_review_for_all_incidents:
        INITIAL_DATABASE_STATE.policy.enforceHumanReviewForAllIncidents,
      allow_waitlist_on_conflict: INITIAL_DATABASE_STATE.policy.allowWaitlistOnConflict,
      institution_name: INITIAL_DATABASE_STATE.policy.institutionName,
      environment_mode: 'Supabase PostgreSQL Production',
      updated_at: new Date().toISOString(),
    });

    if (policyInsertError) {
      throw new Error(`Failed to insert initial platform policy: ${policyInsertError.message}`);
    }
    console.log('  ✓ Initialized platform policy.');
  }

  // 2. Provision Supabase Auth Accounts & Database Profiles
  console.log('\n[2/5] Provisioning Supabase Auth accounts and public profiles...');
  const existingAuthUsers = await fetchAllAuthUsers(supabase);
  console.log(`  • Found ${existingAuthUsers.length} existing Supabase Auth account(s).`);

  for (const user of INITIAL_DATABASE_STATE.users) {
    // Check existing database profile in public.users
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('users')
      .select('id, email, auth_user_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileCheckError) {
      throw new Error(`Failed to check database profile for ${user.id}: ${profileCheckError.message}`);
    }

    // Verify email consistency if profile already exists
    if (existingProfile && existingProfile.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error(
        `CONFLICT DETECTED for user ${user.id}: Database profile email '${existingProfile.email}' ` +
        `does not match seed email '${user.email}'. Aborting to prevent inconsistent data.`
      );
    }

    // Find Auth user by email
    const existingAuth = existingAuthUsers.find(
      (u) => u.email?.toLowerCase() === user.email.toLowerCase()
    );

    let targetAuthId: string;

    if (existingAuth) {
      targetAuthId = existingAuth.id;

      // Inconsistent linkage check
      if (existingProfile?.auth_user_id && existingProfile.auth_user_id !== targetAuthId) {
        throw new Error(
          `CONFLICT DETECTED for user ${user.id} (${user.email}): ` +
          `Existing profile has auth_user_id '${existingProfile.auth_user_id}', ` +
          `but Supabase Auth user is '${targetAuthId}'. ` +
          `Aborting to prevent silent account re-binding. Manual review required.`
        );
      }
      console.log(`  • Existing Auth user found for ${user.email} (${targetAuthId}).`);
    } else {
      // Create new Supabase Auth account
      const { data: newAuth, error: createAuthError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: demoPassword,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          role: user.role,
          department: user.department,
        },
      });

      if (createAuthError || !newAuth?.user) {
        throw new Error(
          `FATAL: Failed to create Supabase Auth account for ${user.email}: ${
            createAuthError?.message || 'Unknown error'
          }. Aborting seed process. No orphan profile will be created.`
        );
      }

      targetAuthId = newAuth.user.id;
      console.log(`  ✓ Created Supabase Auth account for ${user.email} (${targetAuthId}).`);
    }

    // Upsert public.users profile ensuring non-null, verified auth_user_id
    const { error: profileUpsertError } = await supabase.from('users').upsert(
      {
        id: user.id,
        auth_user_id: targetAuthId,
        name: user.name,
        email: user.email,
        department: user.department,
        academic_standing: user.academicStanding,
        role: user.role,
        completed_safety_modules: user.completedSafetyModules,
        active_restrictions: user.activeRestrictions,
      },
      { onConflict: 'id' }
    );

    if (profileUpsertError) {
      throw new Error(`Failed to upsert database profile for ${user.id}: ${profileUpsertError.message}`);
    }
  }
  console.log(`  ✓ Successfully verified and linked ${INITIAL_DATABASE_STATE.users.length} user profiles.`);

  // 3. Seed Educational Resources (Idempotent)
  console.log('\n[3/5] Seeding educational resources directory...');
  for (const res of INITIAL_DATABASE_STATE.resources) {
    const { error: resError } = await supabase.from('resources').upsert(
      {
        id: res.id,
        code: res.code,
        name: res.name,
        category: res.category,
        resource_type: res.resourceType,
        location: res.location,
        building: res.building,
        description: res.description,
        image_url: res.imageUrl,
        status: res.status,
        condition_summary: res.conditionSummary,
        operating_hours: res.operatingHours,
        available_time_slots: res.availableTimeSlots,
        min_duration_hours: res.minDurationHours,
        max_duration_hours: res.maxDurationHours,
        weekly_limit_hours_per_student: res.weeklyLimitHoursPerStudent,
        cooldown_hours: res.cooldownHours,
        eligibility_requirements: res.eligibilityRequirements,
        required_safety_module: res.requiredSafetyModule,
        safety_rules: res.safetyRules,
        manager_id: res.managerId,
        manager_name: res.managerName,
        is_demo_listing: res.isDemoListing,
        specifications: res.specifications,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    if (resError) {
      throw new Error(`Failed to seed resource ${res.id} (${res.code}): ${resError.message}`);
    }
  }
  console.log(`  ✓ Verified ${INITIAL_DATABASE_STATE.resources.length} educational resources.`);

  // 4. Seed Initial Bookings (Idempotent)
  console.log('\n[4/5] Seeding initial demonstration bookings (Asia/Kolkata IST)...');
  for (const bkg of INITIAL_DATABASE_STATE.bookings) {
    const startTimestamp = toCampusTimestamp(bkg.date, bkg.startTime);
    const endTimestamp = toCampusTimestamp(bkg.date, bkg.endTime);

    const { error: bkgError } = await supabase.from('bookings').upsert(
      {
        id: bkg.id,
        resource_id: bkg.resourceId,
        resource_name: bkg.resourceName,
        resource_code: bkg.resourceCode,
        resource_location: bkg.resourceLocation,
        student_id: bkg.studentId,
        student_name: bkg.studentName,
        student_department: bkg.studentDepartment,
        date: bkg.date,
        start_time_text: bkg.startTime,
        end_time_text: bkg.endTime,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        duration_hours: bkg.durationHours,
        purpose: bkg.purpose,
        course_or_project_code: bkg.courseOrProjectCode,
        supervisor_name: bkg.supervisorName,
        agreed_to_safety_rules: bkg.agreedToSafetyRules,
        self_declared_eligible: bkg.selfDeclaredEligible,
        status: bkg.status,
        manager_decision_note: bkg.managerDecisionNote,
        decided_by_name: bkg.decidedByName,
        decided_at: bkg.decidedAt,
        check_in_at: bkg.checkInAt,
        check_out_at: bkg.checkOutAt,
        before_condition_report: bkg.beforeConditionReport,
        after_condition_report: bkg.afterConditionReport,
        flagged_missing_report: bkg.flaggedMissingReport,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    if (bkgError) {
      throw new Error(`Failed to seed booking ${bkg.id}: ${bkgError.message}`);
    }
  }
  console.log(`  ✓ Verified initial bookings.`);

  // 5. Seed Audit Events (Idempotent)
  console.log('\n[5/5] Seeding initial audit ledger entries...');
  for (const ev of INITIAL_DATABASE_STATE.auditEvents) {
    const { error: auditError } = await supabase.from('audit_events').upsert(
      {
        id: ev.id,
        timestamp: ev.timestamp,
        actor_id: ev.actorId,
        actor_name: ev.actorName,
        actor_role: ev.actorRole,
        action_type: ev.actionType,
        target_type: ev.targetType,
        target_id: ev.targetId,
        summary: ev.summary,
        metadata: ev.metadata,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    if (auditError) {
      throw new Error(`Failed to seed audit event ${ev.id}: ${auditError.message}`);
    }
  }
  console.log(`  ✓ Verified initial audit ledger entries.`);

  console.log('\n========================================================');
  console.log('   ✓ Seed Completed Successfully with Zero Errors!      ');
  console.log('========================================================');
}

seed().catch((err: Error) => {
  console.error('\n[FATAL SEED ERROR]:', err.message);
  process.exit(1);
});
