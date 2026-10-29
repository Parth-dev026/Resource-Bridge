import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  History,
  Lock,
  Mail,
  Scale,
  Settings,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuditEvent,
  BookingRequest,
  IncidentReport,
  PlatformPolicySettings,
  Resource,
  User,
  UserRole,
} from '../types';

interface AuditAndAdminViewProps {
  currentUser: User;
  users: User[];
  resources: Resource[];
  bookings: BookingRequest[];
  incidents: IncidentReport[];
  auditEvents: AuditEvent[];
  policy: PlatformPolicySettings;
  onUpdateUserRole: (
    userId: string,
    payload: { role?: UserRole; activeRestrictions?: string | null }
  ) => Promise<void>;
  onUpdatePolicy: (payload: Partial<PlatformPolicySettings>) => Promise<void>;
  onInviteMember?: (payload: {
    email: string;
    name: string;
    role: UserRole;
    department: string;
  }) => Promise<{ success: boolean; message: string; user?: any }>;
  onUpdateMemberStatus?: (
    userId: string,
    status: 'active' | 'inactive'
  ) => Promise<{ success: boolean; message: string; user?: any }>;
}

export const AuditAndAdminView: React.FC<AuditAndAdminViewProps> = ({
  currentUser,
  users,
  resources,
  bookings,
  incidents,
  auditEvents,
  policy,
  onUpdateUserRole,
  onUpdatePolicy,
  onInviteMember,
  onUpdateMemberStatus,
}) => {
  const [selectedSection, setSelectedSection] = useState<'audit' | 'fairness' | 'admin'>(
    currentUser.role === 'admin' ? 'admin' : 'audit'
  );
  const [auditFilter, setAuditFilter] = useState<string>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite member modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('student');
  const [inviteDepartment, setInviteDepartment] = useState('Computer Science');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  // Admin policy edit states
  const [maxPending, setMaxPending] = useState(policy.maxActivePendingRequestsPerStudent);
  const [weeklyCap, setWeeklyCap] = useState(policy.defaultWeeklyHoursCapPerStudent);
  const [cooldownHours, setCooldownHours] = useState(policy.defaultCooldownHoursBetweenBookings);

  const isStaff = currentUser.role === 'manager' || currentUser.role === 'admin';
  const isAdmin = currentUser.role === 'admin';

  const filteredAudit = useMemo(() => {
    if (auditFilter === 'ALL') return auditEvents;
    return auditEvents.filter((ev) => ev.targetType === auditFilter);
  }, [auditEvents, auditFilter]);

  // Fair Sharing Usage Analysis
  const resourceUtilization = useMemo(() => {
    return resources.map((res) => {
      const resBookings = bookings.filter(
        (b) =>
          b.resourceId === res.id &&
          ['Approved', 'CheckedIn', 'Completed'].includes(b.status)
      );
      const totalHours = resBookings.reduce((sum, b) => sum + b.durationHours, 0);

      const byStudent = new Map<string, { name: string; hours: number; count: number }>();
      for (const b of resBookings) {
        const prev = byStudent.get(b.studentId) || {
          name: b.studentName,
          hours: 0,
          count: 0,
        };
        prev.hours += b.durationHours;
        prev.count += 1;
        byStudent.set(b.studentId, prev);
      }

      const topUsers = Array.from(byStudent.entries())
        .map(([studentId, info]) => ({
          studentId,
          ...info,
          sharePercent: totalHours > 0 ? Math.round((info.hours / totalHours) * 100) : 0,
          nearCap: info.hours >= res.weeklyLimitHoursPerStudent * 0.75,
        }))
        .sort((a, b) => b.hours - a.hours);

      return {
        resource: res,
        totalHours,
        bookingCount: resBookings.length,
        topUsers,
      };
    });
  }, [resources, bookings]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await onUpdatePolicy({
        maxActivePendingRequestsPerStudent: Number(maxPending),
        defaultWeeklyHoursCapPerStudent: Number(weeklyCap),
        defaultCooldownHoursBetweenBookings: Number(cooldownHours),
      });
      setFeedback({
        type: 'success',
        text: 'Fair sharing rules and limits updated.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Update failed.',
      });
    }
  };

  const handleRoleChange = async (targetUser: User, nextRole: UserRole) => {
    setFeedback(null);
    try {
      await onUpdateUserRole(targetUser.id, { role: nextRole });
      setFeedback({
        type: 'success',
        text: `Role for ${targetUser.name} updated to '${nextRole}'.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Role update failed.',
      });
    }
  };

  const handleToggleStatus = async (targetUser: User) => {
    if (!onUpdateMemberStatus) return;
    setFeedback(null);
    const nextStatus = targetUser.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await onUpdateMemberStatus(targetUser.id, nextStatus);
      setFeedback({
        type: 'success',
        text: res.message || `Member ${targetUser.name} marked as ${nextStatus}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Status update failed.',
      });
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onInviteMember) return;
    setInviteSubmitting(true);
    setFeedback(null);
    try {
      const res = await onInviteMember({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
        department: inviteDepartment.trim(),
      });
      setFeedback({
        type: 'success',
        text: res.message || `Invitation successfully sent to ${inviteEmail}.`,
      });
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send invitation.',
      });
    } finally {
      setInviteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="text-xs font-mono text-teal-700 font-semibold">
          TRANSPARENCY &amp; FAIR ACCESS · ACTIVITY LEDGER
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">
          Booking and Activity History &amp; Fair Sharing
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Transparent activity logs and weekly hour limits prevent anyone from monopolizing shared gear while keeping student information private.
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-2">
        <button
          type="button"
          onClick={() => setSelectedSection('audit')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            selectedSection === 'audit'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Booking &amp; Activity History ({auditEvents.length})
        </button>

        <button
          type="button"
          onClick={() => setSelectedSection('fairness')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            selectedSection === 'fairness'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Fair Sharing Rules &amp; Limits
        </button>

        <button
          type="button"
          onClick={() => setSelectedSection('admin')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            selectedSection === 'admin'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Administrator Settings &amp; Roles
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-md border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
          role="status"
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: BOOKING & ACTIVITY HISTORY */}
      {selectedSection === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recorded Campus Activity Log</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {isStaff
                  ? 'Teacher & Manager view: all school booking actions and condition checks.'
                  : 'Student view: peer student names are anonymized automatically for student privacy.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'Booking', 'Incident', 'Resource', 'User'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAuditFilter(type)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    auditFilter === type
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {type === 'ALL' ? 'All Events' : type === 'Incident' ? 'Problems' : type}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Event &amp; Time</th>
                  <th className="py-3 px-4">Who Did It</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredAudit.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{ev.id}</div>
                      <div>{new Date(ev.timestamp).toLocaleString()}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{ev.actorName}</div>
                      <div className="font-mono text-slate-500 uppercase">{ev.actorRole}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-teal-800 font-semibold whitespace-nowrap">
                      {ev.actionType}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {ev.targetId}
                    </td>
                    <td className="py-3 px-4 text-slate-700 leading-relaxed">{ev.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: FAIR SHARING RULES */}
      {selectedSection === 'fairness' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs font-mono text-teal-700 font-semibold">RULE 1 · PENDING LIMIT</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                Max {policy.maxActivePendingRequestsPerStudent} Active Requests
              </div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Stops any single student from requesting too many time slots in advance while other students wait.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs font-mono text-teal-700 font-semibold">RULE 2 · WEEKLY HOURS CAP</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                6h – {policy.defaultWeeklyHoursCapPerStudent}h / Student / Week
              </div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Shared kits like the Arduino sets and 3D printer have weekly caps so all classes and project teams get a turn.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs font-mono text-teal-700 font-semibold">RULE 3 · WAITLIST ON CONFLICT</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                Automatic Waitlist
              </div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                If someone else has already booked a slot, you can join the waitlist. If they cancel, you are offered the slot.
              </p>
            </div>
          </div>

          {/* Resource Usage Distribution */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Resource Usage and Fair Distribution Monitor
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Shows how many hours students have booked on each resource this week.
              </p>
            </div>

            <div className="divide-y divide-slate-200">
              {resourceUtilization.map(({ resource, totalHours, bookingCount, topUsers }) => (
                <div key={resource.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-xl">
                    <div className="text-xs font-mono text-teal-700 font-semibold">
                      {resource.code} · Weekly Cap: {resource.weeklyLimitHoursPerStudent}h per student
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{resource.name}</h3>
                    <div className="text-xs text-slate-600 font-mono tabular-nums">
                      Total Usage: {totalHours}h across {bookingCount} session(s)
                    </div>
                  </div>

                  <div className="lg:w-96 space-y-2">
                    {topUsers.length === 0 ? (
                      <div className="text-xs text-slate-500">No bookings logged yet this cycle.</div>
                    ) : (
                      topUsers.map((u) => (
                        <div key={u.studentId} className="text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{u.name}</span>
                            <span className="font-mono tabular-nums text-slate-700">
                              {u.hours}h / {resource.weeklyLimitHoursPerStudent}h cap ({u.sharePercent}% of total)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                            <div
                              className={`h-full ${
                                u.nearCap ? 'bg-amber-600' : 'bg-teal-600'
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((u.hours / resource.weeklyLimitHoursPerStudent) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: ADMINISTRATOR CONTROLS */}
      {selectedSection === 'admin' && (
        <div className="space-y-6">
          {!isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-xs text-amber-900">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Administrator View:</strong> You are signed in as{' '}
                <span className="font-mono font-bold uppercase">{currentUser.role}</span>. Changing user roles or global limits is restricted on the server to the{' '}
                <strong>Principal / Administrator</strong> (Dr. Ananya Deshmukh). You can switch to the Administrator in the top bar to test saving changes!
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* User Directory (8 cols on lg) */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-700" />
                    Organisation Members &amp; Access
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Organisation-authorised accounts only. Public registration is permanently disabled.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedback(null);
                      setIsInviteOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Invite Member</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {users.map((u) => {
                      const isCurrent = u.id === currentUser.id;
                      const userStatus = u.status || 'active';
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span>{u.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-slate-500 text-[11px]">{u.email}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{u.department}</div>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              disabled={!isAdmin || isCurrent}
                              value={u.role}
                              onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                              aria-label={`Role for ${u.name}`}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 disabled:opacity-50"
                            >
                              <option value="student">Student</option>
                              <option value="faculty">Faculty</option>
                              <option value="manager">Lab Manager</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            {userStatus === 'active' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Active
                              </span>
                            )}
                            {userStatus === 'invited' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Mail className="w-3 h-3 text-amber-600" />
                                Invited
                              </span>
                            )}
                            {userStatus === 'inactive' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                <XCircle className="w-3 h-3 text-slate-400" />
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isAdmin && !isCurrent ? (
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${
                                  userStatus === 'active'
                                    ? 'text-rose-700 border-rose-200 hover:bg-rose-50'
                                    : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                }`}
                              >
                                {userStatus === 'active' ? 'Deactivate' : 'Activate'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                {isCurrent ? 'Self-managed' : 'Protected'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Policy Limits (4 cols on lg) */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                Campus Fair Sharing Settings
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Configure fair access rules enforced by the server during booking.
              </p>

              <form onSubmit={handleSavePolicy} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="policy-max-pending"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Max Active Pending Requests per Student
                  </label>
                  <input
                    id="policy-max-pending"
                    type="number"
                    min={1}
                    max={10}
                    disabled={!isAdmin}
                    value={maxPending}
                    onChange={(e) => setMaxPending(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="policy-weekly-cap"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Default Weekly Hours Cap per Student
                  </label>
                  <input
                    id="policy-weekly-cap"
                    type="number"
                    min={2}
                    max={20}
                    disabled={!isAdmin}
                    value={weeklyCap}
                    onChange={(e) => setWeeklyCap(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!isAdmin}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  Save Policy Limits
                </button>
              </form>
            </div>
          </div>

          {/* Invite Member Modal */}
          {isInviteOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div
                className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                role="dialog"
                aria-modal="true"
                aria-labelledby="invite-modal-title"
              >
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-800">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 id="invite-modal-title" className="text-sm font-bold text-slate-900">
                        Invite Organisation Member
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Secure account provisioning with password setup link
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    aria-label="Close dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleInviteSubmit} className="p-5 space-y-4">
                  <div>
                    <label htmlFor="invite-email" className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="e.g. professor.sharma@school-demo.edu"
                      className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>

                  <div>
                    <label htmlFor="invite-name" className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      id="invite-name"
                      type="text"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. Dr. Rajesh Sharma"
                      className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="invite-role" className="block text-xs font-semibold text-slate-700 mb-1">
                        Assigned Role *
                      </label>
                      <select
                        id="invite-role"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as UserRole)}
                        className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        <option value="student">Student</option>
                        <option value="faculty">Faculty</option>
                        <option value="manager">Lab Manager</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="invite-dept" className="block text-xs font-semibold text-slate-700 mb-1">
                        Department / Class *
                      </label>
                      <input
                        id="invite-dept"
                        type="text"
                        required
                        value={inviteDepartment}
                        onChange={(e) => setInviteDepartment(e.target.value)}
                        placeholder="e.g. Physics Dept"
                        className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 leading-relaxed">
                    <strong>Organisation Security Policy:</strong> Public self-registration is permanently disabled. The recipient will receive an official invitation email with a secure setup token to establish their own password.
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsInviteOpen(false)}
                      disabled={inviteSubmitting}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteSubmitting || !inviteEmail.trim() || !inviteName.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50 transition-colors"
                    >
                      {inviteSubmitting ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending Invite...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5" />
                          <span>Send Invitation</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
