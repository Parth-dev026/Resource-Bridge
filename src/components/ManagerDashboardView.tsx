import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  AuditEvent,
  BookingRequest,
  DISPLAY_BOOKING_STATUS,
  IncidentReport,
  NEXT_STEP_GUIDE,
  Resource,
  ResourceCategory,
  ResourceStatus,
  ResourceType,
  User,
} from '../types';

interface ManagerDashboardViewProps {
  user: User;
  resources: Resource[];
  bookings: BookingRequest[];
  incidents: IncidentReport[];
  auditEvents: AuditEvent[];
  onDecideBooking: (
    bookingId: string,
    decision: 'Approved' | 'Rejected' | 'Waitlisted',
    note?: string
  ) => Promise<void>;
  onCreateResource: (payload: Partial<Resource>) => Promise<void>;
  onUpdateResource: (resourceId: string, payload: Partial<Resource>) => Promise<void>;
  onNavigate: (view: 'incidents' | 'audit' | 'catalogue') => void;
}

function parseHour(timeStr: string): number {
  const [hh] = timeStr.split(':').map(Number);
  return Number.isFinite(hh) ? hh : 0;
}

function intervalsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = parseHour(startA);
  const a1 = parseHour(endA);
  const b0 = parseHour(startB);
  const b1 = parseHour(endB);
  return a0 < b1 && b0 < a1;
}

export const ManagerDashboardView: React.FC<ManagerDashboardViewProps> = ({
  user,
  resources,
  bookings,
  incidents,
  auditEvents,
  onDecideBooking,
  onCreateResource,
  onUpdateResource,
  onNavigate,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'resources' | 'conditions'>('requests');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add New Resource Modal/Drawer state
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResName, setNewResName] = useState('');
  const [newResCode, setNewResCode] = useState('SCH-KIT-05');
  const [newResCategory, setNewResCategory] = useState<ResourceCategory>('Electronics & Coding Kits');
  const [newResType, setNewResType] = useState<ResourceType>('Kit');
  const [newResLocation, setNewResLocation] = useState('Electronics & Robotics Room · Shelf C');
  const [newResDesc, setNewResDesc] = useState('');
  const [newResOperatingHours, setNewResOperatingHours] = useState('08:00 – 18:00 (Mon–Fri)');
  const [newResSafetyModule, setNewResSafetyModule] = useState('Electronics & Microcontroller Starter Briefing');
  const [newResMaxHours, setNewResMaxHours] = useState(3);
  const [newResWeeklyCap, setNewResWeeklyCap] = useState(6);

  const pendingBookings = bookings.filter((b) => b.status === 'Pending');
  const waitlistedBookings = bookings.filter((b) => b.status === 'Waitlisted');
  const approvedAndActiveBookings = bookings.filter(
    (b) => b.status === 'Approved' || b.status === 'CheckedIn'
  );
  const openIncidents = incidents.filter((i) => i.status === 'Reported' || i.status === 'Under Review');

  const bookingsWithConditionReports = bookings.filter(
    (b) => b.beforeConditionReport || b.afterConditionReport
  );

  const handleDecision = async (
    bookingId: string,
    decision: 'Approved' | 'Rejected' | 'Waitlisted'
  ) => {
    setActionFeedback(null);
    setBusyBookingId(bookingId);
    try {
      await onDecideBooking(bookingId, decision, decisionNotes[bookingId]);
      const friendlyDecision =
        decision === 'Approved' ? 'Approved' : decision === 'Waitlisted' ? 'Waitlisted' : 'Not Approved';
      setActionFeedback({
        type: 'success',
        text: `Booking ${bookingId} has been marked as '${friendlyDecision}'.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Decision failed.',
      });
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCreateResourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionFeedback(null);
    try {
      await onCreateResource({
        name: newResName,
        code: newResCode,
        category: newResCategory,
        resourceType: newResType,
        location: newResLocation,
        description: newResDesc,
        operatingHours: newResOperatingHours,
        requiredSafetyModule: newResSafetyModule,
        maxDurationHours: Number(newResMaxHours),
        weeklyLimitHoursPerStudent: Number(newResWeeklyCap),
        status: 'Available',
      });
      setShowAddResource(false);
      setNewResName('');
      setNewResDesc('');
      setActionFeedback({
        type: 'success',
        text: `Resource ${newResCode} added to the catalogue.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create resource.',
      });
    }
  };

  const handleQuickStatusChange = async (resource: Resource, nextStatus: ResourceStatus) => {
    setActionFeedback(null);
    try {
      await onUpdateResource(resource.id, {
        status: nextStatus,
        conditionSummary:
          nextStatus === 'Maintenance'
            ? `Maintenance initiated by ${user.name} on ${new Date().toLocaleDateString()}.`
            : nextStatus === 'Available'
            ? `Good — Cleaned, checked, and restored to Available by ${user.name}.`
            : resource.conditionSummary,
      });
      setActionFeedback({
        type: 'success',
        text: `${resource.name} is now marked as '${nextStatus}'.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update resource status.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-teal-700 font-semibold">
            TEACHER &amp; LAB MANAGER CONSOLE · ROLE: {user.role.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Resource Manager Dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">
            Review incoming requests, prevent double bookings, manage equipment condition, and handle reported problems.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('resources');
              setShowAddResource(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Resource Listing
          </button>
          <button
            type="button"
            onClick={() => onNavigate('incidents')}
            className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Reported Problems ({openIncidents.length} Open)
          </button>
        </div>
      </div>

      {/* 4-Column KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Requests Waiting for Approval</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {pendingBookings.length}
          </div>
          <div className="text-xs text-amber-700 mt-1">
            {waitlistedBookings.length} student request(s) on waitlist
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Approved &amp; Active Bookings</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {approvedAndActiveBookings.length}
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            Scheduled without double-booking
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Resources in Maintenance</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {resources.filter((r) => r.status === 'Maintenance' || r.status === 'Restricted').length} /{' '}
            {resources.length}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Paused while being cleaned or repaired
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Reported Problems to Review</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {openIncidents.length}
          </div>
          <div className="text-xs text-teal-700 mt-1">
            Managers review all decisions
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`p-3.5 rounded-md border text-xs flex items-center justify-between ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
          role="status"
        >
          <span>{actionFeedback.text}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-xs underline font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('requests')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeSubTab === 'requests'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Review Booking Requests ({pendingBookings.length + waitlistedBookings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('resources')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeSubTab === 'resources'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Manage Resources &amp; Availability ({resources.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('conditions')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeSubTab === 'conditions'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Condition Reports Before &amp; After Use ({bookingsWithConditionReports.length})
        </button>
      </div>

      {/* TAB 1: REVIEW BOOKING REQUESTS */}
      {activeSubTab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 cols: Pending & Waitlisted Queue */}
          <div className="lg:col-span-8 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Student Requests Waiting for Your Decision
            </h2>

            {pendingBookings.length === 0 && waitlistedBookings.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                <div className="text-sm font-bold text-slate-900">All incoming requests are reviewed!</div>
                <p className="text-xs text-slate-600">
                  When students submit new booking requests, they will appear here for you to check and approve.
                </p>
              </div>
            ) : (
              [...pendingBookings, ...waitlistedBookings].map((req) => {
                // Detect if this request overlaps with an already Approved booking
                const conflictingApproved = bookings.find(
                  (b) =>
                    b.id !== req.id &&
                    b.resourceId === req.resourceId &&
                    b.date === req.date &&
                    (b.status === 'Approved' || b.status === 'CheckedIn') &&
                    intervalsOverlap(req.startTime, req.endTime, b.startTime, b.endTime)
                );

                // Detect if it overlaps with another Pending request
                const competingPending = bookings.filter(
                  (b) =>
                    b.id !== req.id &&
                    b.resourceId === req.resourceId &&
                    b.date === req.date &&
                    b.status === 'Pending' &&
                    intervalsOverlap(req.startTime, req.endTime, b.startTime, b.endTime)
                );

                return (
                  <article
                    key={req.id}
                    className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="font-semibold text-slate-900">{req.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-teal-700 font-semibold">{req.resourceCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>Requested {new Date(req.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="font-sans font-semibold text-amber-700">
                        {DISPLAY_BOOKING_STATUS[req.status]}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900">{req.resourceName}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
                        <span>
                          <strong>Student:</strong> {req.studentName} ({req.studentDepartment})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          <strong>Date &amp; Time:</strong> {req.date} · {req.startTime}–{req.endTime} ({req.durationHours} hours)
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1">
                      <div>
                        <span className="font-semibold text-slate-900">Why needed:</span> {req.purpose}
                      </div>
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-800">Course / Project:</span>{' '}
                        {req.courseOrProjectCode} · Mentor: {req.supervisorName}
                      </div>
                    </div>

                    {/* Avoid Double Bookings Alert Banner */}
                    {conflictingApproved && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900 flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                        <div>
                          <strong>Avoid Double Bookings:</strong> This requested slot ({req.startTime}–{req.endTime}) overlaps with an already approved booking{' '}
                          <span className="font-mono font-semibold">{conflictingApproved.id}</span> for{' '}
                          {conflictingApproved.studentName}. Direct approval is blocked to protect the approved slot. You can{' '}
                          <strong>Place on Waitlist</strong> or <strong>Decline</strong> this request.
                        </div>
                      </div>
                    )}

                    {!conflictingApproved && competingPending.length > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <strong>Multiple Pending Requests for Same Time:</strong> Another student also requested this time. Approving one will give them the slot.
                        </div>
                      </div>
                    )}

                    {/* Note & Decision Buttons */}
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <label
                          htmlFor={`note-${req.id}`}
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          Note for the student (optional)
                        </label>
                        <input
                          id={`note-${req.id}`}
                          type="text"
                          value={decisionNotes[req.id] || ''}
                          onChange={(e) =>
                            setDecisionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="e.g. 'Approved. Pick up kit from Cupboard 2.' or reason if declining..."
                          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busyBookingId === req.id || Boolean(conflictingApproved)}
                          onClick={() => handleDecision(req.id, 'Approved')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve Booking
                        </button>

                        <button
                          type="button"
                          disabled={busyBookingId === req.id}
                          onClick={() => handleDecision(req.id, 'Waitlisted')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Place on Waitlist
                        </button>

                        <button
                          type="button"
                          disabled={busyBookingId === req.id}
                          onClick={() => handleDecision(req.id, 'Rejected')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Do Not Approve (Decline)
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Right 4 cols: Schedule Overview */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-200">
                Scheduled Bookings ({approvedAndActiveBookings.length})
              </h2>
              {approvedAndActiveBookings.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No approved bookings right now.</p>
              ) : (
                <div className="divide-y divide-slate-200 mt-2">
                  {approvedAndActiveBookings.map((b) => (
                    <div key={b.id} className="py-3 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-900">
                          {b.id} · {b.resourceCode}
                        </span>
                        <span
                          className={
                            b.status === 'CheckedIn'
                              ? 'text-teal-700 font-sans font-semibold'
                              : 'text-emerald-700 font-sans font-semibold'
                          }
                        >
                          {DISPLAY_BOOKING_STATUS[b.status]}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800">{b.studentName}</div>
                      <div className="font-mono text-slate-600 tabular-nums">
                        {b.date} · {b.startTime}–{b.endTime} ({b.durationHours}h)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-200">
                Recent Manager Decisions
              </h2>
              <div className="divide-y divide-slate-100 mt-2">
                {auditEvents.slice(0, 5).map((ev) => (
                  <div key={ev.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono text-slate-500 tabular-nums">
                      <span>{ev.actionType.replace(/_/g, ' ')}</span>
                      <span>{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-slate-700">{ev.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: MANAGE RESOURCES & AVAILABILITY */}
      {activeSubTab === 'resources' && (
        <div className="space-y-6">
          {showAddResource && (
            <form
              onSubmit={handleCreateResourceSubmit}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900">Add a New Shared Resource</h2>
                <button
                  type="button"
                  onClick={() => setShowAddResource(false)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Close Form
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Item Code</label>
                  <input
                    type="text"
                    value={newResCode}
                    onChange={(e) => setNewResCode(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Resource Name</label>
                  <input
                    type="text"
                    value={newResName}
                    onChange={(e) => setNewResName(e.target.value)}
                    placeholder="e.g. Raspberry Pi Starter Kit or Physics Optical Bench"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Category</label>
                  <select
                    value={newResCategory}
                    onChange={(e) => setNewResCategory(e.target.value as ResourceCategory)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="Electronics & Coding Kits">Electronics &amp; Coding Kits</option>
                    <option value="Computers & Laptops">Computers &amp; Laptops</option>
                    <option value="3D Printing & Making">3D Printing &amp; Making</option>
                    <option value="Science & Physics Labs">Science &amp; Physics Labs</option>
                    <option value="Project Rooms & Spaces">Project Rooms &amp; Spaces</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Type</label>
                  <select
                    value={newResType}
                    onChange={(e) => setNewResType(e.target.value as ResourceType)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="Kit">Kit</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Workstation">Workstation</option>
                    <option value="Laboratory Space">Laboratory Space</option>
                    <option value="Room">Room</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Location</label>
                  <input
                    type="text"
                    value={newResLocation}
                    onChange={(e) => setNewResLocation(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Operating Hours</label>
                  <input
                    type="text"
                    value={newResOperatingHours}
                    onChange={(e) => setNewResOperatingHours(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Max Hours / Slot</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={newResMaxHours}
                    onChange={(e) => setNewResMaxHours(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Weekly Student Cap (h)</label>
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={newResWeeklyCap}
                    onChange={(e) => setNewResWeeklyCap(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newResDesc}
                  onChange={(e) => setNewResDesc(e.target.value)}
                  placeholder="Describe what is included and what students can use it for..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddResource(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800"
                >
                  Save and Publish
                </button>
              </div>
            </form>
          )}

          {/* Resources Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Shared Resources &amp; Availability Status
              </h2>
              {!showAddResource && (
                <button
                  type="button"
                  onClick={() => setShowAddResource(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Resource
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Code &amp; Name</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4 text-right">Limits</th>
                    <th className="py-3 px-4">Condition</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {resources.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-mono font-semibold text-teal-700">{res.code}</div>
                        <div className="font-bold text-slate-900 mt-0.5">{res.name}</div>
                        <div className="text-slate-500 mt-0.5">{res.category}</div>
                      </td>
                      <td className="py-3.5 px-4 align-top text-slate-700">
                        <div>{res.location}</div>
                        <div className="font-mono text-slate-500 mt-0.5 tabular-nums">{res.operatingHours}</div>
                      </td>
                      <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-slate-800">
                        <div>Max {res.maxDurationHours}h / slot</div>
                        <div className="text-slate-500">{res.weeklyLimitHoursPerStudent}h / wk cap</div>
                      </td>
                      <td className="py-3.5 px-4 align-top max-w-xs text-slate-700">
                        {res.conditionSummary}
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <select
                          value={res.status}
                          onChange={(e) =>
                            handleQuickStatusChange(res, e.target.value as ResourceStatus)
                          }
                          aria-label={`Change status for ${res.name}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
                        >
                          <option value="Available">Available</option>
                          <option value="In Use">In Use</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Restricted">Restricted</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CONDITION REPORTS BEFORE & AFTER USE */}
      {activeSubTab === 'conditions' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              Condition Reports Before &amp; After Use
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Review what students recorded when checking in and returning shared resources.
            </p>
          </div>

          {bookingsWithConditionReports.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No condition reports submitted yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {bookingsWithConditionReports.map((b) => (
                <div key={b.id} className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-mono">
                      <span className="font-bold text-slate-900">{b.id}</span> ·{' '}
                      <span className="text-teal-700 font-semibold">{b.resourceCode}</span> ·{' '}
                      <span className="font-sans font-semibold text-slate-900">{b.resourceName}</span>
                    </div>
                    <div className="text-slate-600">
                      Student: <strong>{b.studentName}</strong> · Slot:{' '}
                      <span className="font-mono tabular-nums">
                        {b.date} ({b.startTime}–{b.endTime})
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {b.beforeConditionReport ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                        <div className="flex items-center justify-between font-mono text-slate-500 tabular-nums">
                          <span className="font-sans font-semibold text-slate-900">
                            Check-In (Before Use)
                          </span>
                          <span>{new Date(b.beforeConditionReport.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="font-semibold text-teal-800">{b.beforeConditionReport.rating}</div>
                        <p className="text-slate-700">{b.beforeConditionReport.notes}</p>
                      </div>
                    ) : (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800">
                        No Before-Use Condition Report
                      </div>
                    )}

                    {b.afterConditionReport ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                        <div className="flex items-center justify-between font-mono text-slate-500 tabular-nums">
                          <span className="font-sans font-semibold text-slate-900">
                            Check-Out (After Use)
                          </span>
                          <span>{new Date(b.afterConditionReport.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="font-semibold text-emerald-800">{b.afterConditionReport.rating}</div>
                        <p className="text-slate-700">{b.afterConditionReport.notes}</p>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900">
                        Awaiting Return &amp; Check-Out Report (Current Status: {DISPLAY_BOOKING_STATUS[b.status]})
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
