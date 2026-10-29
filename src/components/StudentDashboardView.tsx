import React from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cpu,
  FileWarning,
  Info,
  ShieldCheck,
} from 'lucide-react';
import {
  AuditEvent,
  BookingRequest,
  DISPLAY_BOOKING_STATUS,
  NEXT_STEP_GUIDE,
  PlatformPolicySettings,
  Resource,
  User,
} from '../types';

interface StudentDashboardViewProps {
  user: User;
  resources: Resource[];
  bookings: BookingRequest[];
  auditEvents: AuditEvent[];
  policy: PlatformPolicySettings;
  onNavigate: (view: 'catalogue' | 'my-bookings' | 'incidents' | 'audit') => void;
  onSelectResource: (resource: Resource) => void;
  onOpenCheckInOut: (booking: BookingRequest, mode: 'checkin' | 'checkout') => void;
}

export const StudentDashboardView: React.FC<StudentDashboardViewProps> = ({
  user,
  resources,
  bookings,
  auditEvents,
  policy,
  onNavigate,
  onSelectResource,
  onOpenCheckInOut,
}) => {
  const myBookings = bookings.filter((b) => b.studentId === user.id);
  const pendingBookings = myBookings.filter((b) => b.status === 'Pending');
  const approvedOrActiveBookings = myBookings.filter(
    (b) => b.status === 'Approved' || b.status === 'CheckedIn'
  );
  const waitlistedBookings = myBookings.filter((b) => b.status === 'Waitlisted');
  const completedBookings = myBookings.filter((b) => b.status === 'Completed');

  const availableResources = resources.filter((r) => r.status === 'Available');
  const myUsedHoursThisWeek = myBookings
    .filter((b) => ['Approved', 'CheckedIn', 'Completed'].includes(b.status))
    .reduce((acc, b) => acc + b.durationHours, 0);

  const recentPersonalAudit = auditEvents
    .filter((ev) => ev.actorId === user.id || myBookings.some((b) => b.id === ev.targetId))
    .slice(0, 6);

  const arduinoResource = resources.find((r) => r.code === 'SCH-ARD-04');

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="text-xs font-mono text-teal-700 font-semibold">
            STUDENT DASHBOARD · {user.academicStanding.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>{user.department}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{user.email}</span>
            <span aria-hidden="true">·</span>
            <span>{user.completedSafetyModules.length} Safety Clearances Verified</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('catalogue')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Browse Resources
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('my-bookings')}
            className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            My Bookings ({myBookings.length})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('incidents')}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            Report a Problem
          </button>
        </div>
      </div>

      {/* Featured Demonstration Callout for Arduino Kit */}
      {approvedOrActiveBookings.some((b) => b.resourceCode === 'SCH-ARD-04') && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-teal-950">
          <div className="flex items-start gap-2.5">
            <Cpu className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-teal-900">
                Primary Demonstration: Arduino Starter Kit #04 is Approved &amp; Ready!
              </div>
              <p className="text-teal-800 mt-0.5">
                You have an approved booking for the Arduino kit. Click <strong>Check In &amp; Record Condition</strong> below to test the pre-use inspection, or browse the catalogue to try requesting another resource like Computer Lab 2.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4-Column Metric Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Available School Resources</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {availableResources.length} / {resources.length}
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            Ready for booking without double-booking
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Approved &amp; Active Bookings</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {approvedOrActiveBookings.length}
          </div>
          <div className="text-xs text-teal-700 mt-1">
            {approvedOrActiveBookings.some((b) => b.status === 'CheckedIn')
              ? '1 session currently in use'
              : 'Ready for check-in at your scheduled time'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Waiting for Manager Approval</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {pendingBookings.length}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {waitlistedBookings.length} on waitlist · Max {policy.maxActivePendingRequestsPerStudent} pending allowed
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Weekly Fair-Sharing Hours Used</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {myUsedHoursThisWeek}h / {policy.defaultWeeklyHoursCapPerStudent}h
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {completedBookings.length} finished sessions with condition reports
          </div>
        </div>
      </div>

      {/* Main Two-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Approved Sessions and Pending Queue */}
        <div className="lg:col-span-7 space-y-6">
          {/* Approved & Active Bookings */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Approved Bookings &amp; Active Sessions
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Record equipment condition before using it, and record it again when returning.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('my-bookings')}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
              >
                All Bookings
              </button>
            </div>

            {approvedOrActiveBookings.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Calendar className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-600">
                  You have no approved bookings waiting right now.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('catalogue')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  Browse Resources to Make a Request
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 mt-2">
                {approvedOrActiveBookings.map((booking) => (
                  <div key={booking.id} className="py-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="font-semibold text-slate-900">{booking.id}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-teal-700 font-semibold">{booking.resourceCode}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              booking.status === 'CheckedIn'
                                ? 'font-sans font-semibold text-teal-700'
                                : 'font-sans font-semibold text-emerald-700'
                            }
                          >
                            {DISPLAY_BOOKING_STATUS[booking.status]}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{booking.resourceName}</h3>
                        <div className="text-xs text-slate-600 font-mono tabular-nums">
                          {booking.date} · {booking.startTime}–{booking.endTime} ({booking.durationHours}h) ·{' '}
                          <span className="font-sans">{booking.resourceLocation}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {booking.status === 'Approved' ? (
                          <button
                            type="button"
                            onClick={() => onOpenCheckInOut(booking, 'checkin')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            Check In &amp; Record Condition
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenCheckInOut(booking, 'checkout')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Check Out &amp; Return Item
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Clear Next Step Guidance Box */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 flex items-start gap-2">
                      <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                      <span>{NEXT_STEP_GUIDE[booking.status]}</span>
                    </div>

                    {booking.managerDecisionNote && (
                      <p className="text-xs text-slate-600 bg-amber-50/60 border border-amber-200/70 rounded p-2">
                        <span className="font-semibold text-slate-900">Teacher/Manager Note:</span>{' '}
                        {booking.managerDecisionNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pending & Waitlisted Requests */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">Requests Waiting for Approval</h2>
                <p className="text-xs text-slate-600">The teacher or lab manager will review these shortly.</p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {pendingBookings.length + waitlistedBookings.length} total
              </span>
            </div>

            {pendingBookings.length === 0 && waitlistedBookings.length === 0 ? (
              <p className="text-xs text-slate-600 py-6 text-center">
                You have no requests currently waiting for approval.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 mt-2">
                {[...pendingBookings, ...waitlistedBookings].map((booking) => (
                  <div key={booking.id} className="py-3.5 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="font-semibold text-slate-900">{booking.id}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-teal-700">{booking.resourceCode}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans font-semibold text-amber-700">
                            {DISPLAY_BOOKING_STATUS[booking.status]}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{booking.resourceName}</div>
                        <div className="text-xs text-slate-600 font-mono tabular-nums">
                          {booking.date} · {booking.startTime}–{booking.endTime} ({booking.durationHours}h)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('my-bookings')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 self-start sm:self-center whitespace-nowrap shrink-0"
                      >
                        View in My Bookings
                      </button>
                    </div>
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded px-2.5 py-1.5">
                      {NEXT_STEP_GUIDE[booking.status]}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Cols: Quick Equipment List & Clearances */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Equipment List */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Popular School Resources</h2>
              <button
                type="button"
                onClick={() => onNavigate('catalogue')}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
              >
                View All
              </button>
            </div>

            <div className="divide-y divide-slate-200 mt-2">
              {resources.slice(0, 4).map((res) => (
                <div key={res.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-500">
                      {res.code} ·{' '}
                      <span
                        className={
                          res.status === 'Available'
                            ? 'text-emerald-700 font-semibold'
                            : 'text-amber-700 font-semibold'
                        }
                      >
                        {res.status}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate mt-0.5">{res.name}</div>
                    <div className="text-xs text-slate-500 truncate">{res.location}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectResource(res)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-800 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Check Slot
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Safety Clearances */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              Check Who Can Use Resources (Your Clearances)
            </h2>
            <ul className="space-y-1.5 text-xs text-slate-700">
              {user.completedSafetyModules.map((mod) => (
                <li key={mod} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{mod}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-100">
              These simple briefings confirm you know basic lab conduct and equipment care.
            </p>
          </section>

          {/* Recent Booking and Activity History */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Recent Activity History</h2>
              <button
                type="button"
                onClick={() => onNavigate('audit')}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
              >
                Full History
              </button>
            </div>
            <div className="divide-y divide-slate-100 mt-2">
              {recentPersonalAudit.map((ev) => (
                <div key={ev.id} className="py-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 font-mono tabular-nums">
                    <span>{ev.actionType.replace(/_/g, ' ')}</span>
                    <span>{new Date(ev.timestamp).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{ev.summary}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
